/* eslint-env node */

"use strict";

const fluid = require("infusion");
const minimist = require("minimist");

fluid.require("%imerss-bioinfo");

require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/writeCSV.js");

require("./iNaturalist/taxonAPI.js");

const hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

hortis.handleFailure = function () {
    process.exit(1);
};

fluid.failureEvent.addListener(hortis.handleFailure, "hortis", "before:fail");

hortis.inputFileToTrunk = function (inputFile) {
    const lastdotpos = inputFile.lastIndexOf(".");
    const lasthypos = inputFile.lastIndexOf("-");
    const trunkPos = lasthypos === -1 ? lastdotpos : lasthypos;
    return inputFile.substring(0, trunkPos);
};

const strategies = {
    bees: {
        plant: {
            iNatName: "plantINatName",
            rawName: "plantScientificName",
            iNatId: "plantINatId",
            assignedINatName: "plantAssignedINatName"
        },
        pollinator: {
            iNatName: "pollinatorINatName",
            rawName: "scientificName",
            iNatId: "pollinatorINatId",
            assignedINatName: "pollinatorAssignedINatName"
        }
    },
    // Has been reintegrated already, info should match and we just need to compute and assign higher taxa
    reintegrated: {
        iNatName: "iNaturalist taxon name",
        rawName: "Taxon name",
        iNatId: "iNaturalist taxon ID",
        assignedINatName: "iNaturalist taxon name"
    }
};

const parsedArgs = minimist(process.argv.slice(2), {boolean: Object.keys(strategies)});

const swapsFile = parsedArgs.swaps || fluid.module.resolvePath("%imerss-bioinfo/data/b-team/taxon-swaps.csv");

const inputFile = parsedArgs._[0] || fluid.module.resolvePath("%imerss-bioinfo/data/b-team/plant-pollinators-Carril-normalised.csv");

const inputTrunk = hortis.inputFileToTrunk(inputFile);

const outputFile = parsedArgs.o || inputTrunk + "-assigned.csv";
const outputTaxaFile = parsedArgs.taxa || inputTrunk + "-assigned-taxa.csv";

const mismatchFile = parsedArgs.mismatches || inputTrunk + "-mismatches.csv";

const reader = hortis.csvReaderWithoutMap({
    inputFile: inputFile
});

const swapsReader = hortis.csvReaderWithMap({
    inputFile: swapsFile,
    mapColumns: {
        "preferred": "Preferred name",
        "supplied": "Supplied name",
        "comments": "Comments"
    }
});

const source = hortis.iNatTaxonSource({
//    disableNameCache: true
});


const strategy = Object.keys(strategies).find(strategy => parsedArgs[strategy]);
const strategyBigRec = strategies[strategy];


// Added in Epifamily so we can include Bees [Epifamily Anthophila]
const storeRanks = ["stateofmatter", "kingdom", "phylum", "subphylum", "class", "order", "epifamily", "family", "genus"];

hortis.iNat.newRecordTransform = {
    iNaturalistTaxonName: "name",
    commonName: "preferred_common_name", // This one seems to have moved in the new API
    rank: "rank",
    iNaturalistTaxonImage: "default_photo.medium_url"
};

hortis.addName = function (allTaxa, id, name, nameStatus) {
    const existing = allTaxa[id];
    existing.names = existing.names || {};
    existing.names[name] = nameStatus;

    // Bodge to ensure that we don't omit higher taxa which do appear in catalogue - in practice we need
    // a swaps system
    // In practice there is too much junk in the OBA data
    // if (nameStatus === "accepted") {
    //    existing.taxonName = existing.iNaturalistTaxonName;
    //}
};

hortis.storeTaxon = async function (allTaxa, taxonDoc, inSummary) {
    const id = taxonDoc.doc.id;
    if (!allTaxa[id]) {
        const filtered = {id};
        const ancestry = await hortis.iNat.getAncestry(id, source);
        let parentId;
        ancestry.forEach((ancestour, i) => {
            if (storeRanks.includes(ancestour.doc.rank)) {
                if (inSummary) {
                    hortis.storeTaxon(allTaxa, ancestour, false);
                }
                if (i > 0 && !parentId) {
                    parentId = ancestour.doc.id;
                }
            }
        });
        filtered.depth = ancestry.length;
        // eslint-disable-next-line eqeqeq
        if (!parentId && id != 48460) {
            // TODO: Why does this exception not bomb out the stack without the failure handler?
            fluid.fail("Cannot find parent taxon for taxon ", taxonDoc.doc);
        }
        filtered.parentId = parentId;
        // Call out for the standard fields that the viz depends on
        hortis.iNat.addTaxonInfo(hortis.iNat.newRecordTransform, filtered, taxonDoc.doc);
        // TODO: Should actualy be the curated summary name
        filtered.taxonName = inSummary ? filtered.iNaturalistTaxonName : "";
        allTaxa[id] = filtered;
    }
};

// Note: This is the beginning of "new marmalisation" - hortis.iNat.addTaxonInfo used to be called in the marmaliser
hortis.applyName = async function (row, phylum, invertedSwaps, allTaxa, unmappedTaxa, strategyRec) {
    const s = strategyRec;
    const fieldName = s.iNatName;
    const rawName = row[fieldName];
    const iNatName = invertedSwaps[rawName]?.preferred || rawName;
    const scientificName = row[s.rawName];
    // const saneName = hortis.sanitizeSpeciesName(taxon);
    const looked = await source.get({name: iNatName, phylum: phylum});

    const assign = function (row, field, value) {
        // eslint-disable-next-line eqeqeq
        if (row[field] !== undefined && row[field] != value) {
            console.log(`Inconsistency in reintegrated data - assigning ${value} to field ${field} over existing value ${row[field]}`);
            console.log("Row: ", row);
        }
        row[field] = value;
    };

    if (looked && looked.doc && looked.doc.phylumMatch) {
        const id = looked.doc.id;
        assign(row, s.iNatId, id);
        assign(row, s.assignedINatName, looked.doc.name);
        const existing = allTaxa[id];
        if (!existing) {
            const taxonDoc = await source.get({id: id});
            await hortis.storeTaxon(allTaxa, taxonDoc, true);
        }
        // Can't recall what this field did
        // hortis.addName(allTaxa, id, iNatName, looked.doc.nameStatus);
    } else {
        row["Name Status"] = "unknown";
        unmappedTaxa[iNatName] = {scientificName};
    }
};

hortis.invertSwaps = function (swapRows) {
    const swaps = {};
    swapRows.forEach(function (row) {
        swaps[row.supplied] = row;
    });
    return swaps;
};

hortis.depthComparator = function (rowa, rowb) {
    return rowa.depth - rowb.depth;
};

hortis.flattenTaxa = function (taxa) {
    const taxaRows = Object.values(taxa);
    // taxaRows.forEach(row => row.names = JSON.stringify(row.names));
    taxaRows.sort(hortis.depthComparator);
    taxaRows.forEach(row => delete row.depth);
    return taxaRows;
};

Promise.all([reader.completionPromise, swapsReader.completionPromise, source.events.onCreate]).then(async function () {
    const mapped = [];
    // Receives map of taxon id to row for all taxa which are seen
    const taxa = {};
    const unmappedTaxa = {};
    const invertedSwaps = hortis.invertSwaps(swapsReader.rows);
    for (let i = 0; i < reader.rows.length; ++i) {
        if ( (i % 100) === 0) {
            console.log("Processing row ", i);
        }
        const row = reader.rows[i];
        if (strategy === "bees") {
            await hortis.applyName(row, "Tracheophyta", invertedSwaps, taxa, unmappedTaxa, strategyBigRec.plant);
            await hortis.applyName(row, "Arthropoda", invertedSwaps, taxa, unmappedTaxa, strategyBigRec.pollinator);
        } else if (strategy === "reintegrated") {
            await hortis.applyName(row, row.Phylum, invertedSwaps, taxa, unmappedTaxa, strategyBigRec);
        }

        mapped.push(row);
    }
    const resolveOut = fluid.module.resolvePath(outputFile);
    await hortis.writeCSV(resolveOut, Object.keys(mapped[0]), mapped, fluid.promise());

    const taxaRows = hortis.flattenTaxa(taxa);
    await hortis.writeCSV(outputTaxaFile, Object.keys(taxaRows[0]), taxaRows, fluid.promise());

    const unmapped = Object.keys(unmappedTaxa);
    if (unmapped.length > 0) {
        console.log("Listing " + unmapped.length + " unmapped taxa:");
        const unmappedRows = unmapped.map(function (key) {
            const scientificName = unmappedTaxa[key].scientificName;
            console.log(key + ", original name " + scientificName);
            return {taxonName: key, originalName: scientificName};
        });
        await hortis.writeCSV(mismatchFile, Object.keys(unmappedRows[0]), unmappedRows, fluid.promise());
    }

});
