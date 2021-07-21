/* eslint-env node */

"use strict";

var fluid = require("infusion");
var minimist = require("minimist");
var moment = require("moment-timezone");
var ExcelJS = require("exceljs");
var fs = require("fs");

fluid.require("%bagatelle");

require("./dataProcessing/readJSON.js");
require("./dataProcessing/readCSV.js");
require("./dataProcessing/readCSVwithMap.js");
require("./dataProcessing/readCSVwithoutMap.js");
require("./dataProcessing/writeCSV.js");
require("./expressions/expr.js");
require("./utils/utils.js");

var hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

var parsedArgs = minimist(process.argv.slice(2));

require("./WoRMS/taxonAPI.js");
var WoRMSTaxonAPIFileBase = "data/WoRMS/taxonAPI";

// Yes, if only it actually were a pipeline!
var pipeline = hortis.readJSONSync(parsedArgs.pipeline || "data/dataPaper-I-in/arpha-out.json5");

var summaryMap = hortis.readJSONSync(fluid.module.resolvePath(pipeline.summaryFileMap), "reading summary map file");

var summaryReader = hortis.csvReaderWithMap({
    inputFile: fluid.module.resolvePath(pipeline.summaryFile),
    mapColumns: summaryMap.columns
});

var obsMap = hortis.readJSONSync(fluid.module.resolvePath(pipeline.obsFileMap), "reading obs map file");

var obsReader = hortis.csvReaderWithMap({
    inputFile: fluid.module.resolvePath(pipeline.obsFile),
    mapColumns: obsMap.columns
});

var patchReader = pipeline.patchFile ? hortis.csvReaderWithoutMap({
    inputFile: fluid.module.resolvePath(pipeline.patchFile)
}) : {
    completionPromise: fluid.promise().resolve([]),
    rows: []
};

var outputDir = fluid.module.resolvePath(pipeline.outputDir);
fs.mkdirSync(outputDir, { recursive: true });

hortis.genusEx = /\((.*)\)/;

hortis.normalise = function (str) {
    return str.replace(/\s+/g, " ").trim();
};

// Variant for summaries
hortis.extractGenus = function (name, outRow) {
    var matches = hortis.genusEx.exec(name);
    var togo;
    if (matches) {
        outRow.Subgenus = matches[1];
        togo = name.replace(hortis.genusEx, "");
    } else {
        togo = name;
    }
    return hortis.normalise(togo);
};

// Variant for obs -> Darwin Core
hortis.axeFromName = ["sp.", "ssp.", "spp."];

hortis.qualForming = ["complex", "agg", "s.lat.", "cf", "sp.nov.", "var.", "sp.A", "sp.B"];

hortis.extractSubgenus = function (seg, outRow) {
    if (seg.startsWith("(") && seg.endsWith(")")) {
        outRow.subgenus = seg.substring(1, seg.length - 1);
        return 1;
    } else {
        return 0;
    }
};

/*
 * AS of 19/7/21
 * so yes, in the 'qualifier' field I think the only relevant values from our dataset are: 'cf.', 'species complex', 'sp.A', and 'sp.B'
 * in the 'identificationRemarks' field we will add the critical note
 * so let's discard 'sp.' and 'spp.' from the catalogue
 * we will only use it in the curated summary / checklists
 */

hortis.extractQualifier = function (name, outRow) {
    var words = name.split(" ");
    // Unconditionally axe sp/spp/ssp from all words
    var useWords = words.filter(function (word) {
        return !hortis.axeFromName.includes(word);
    });

    var bareWords = useWords.filter(function (word) {
        return !hortis.qualForming.includes(word);
    });

    var sspPoint = 1 + hortis.extractSubgenus(bareWords[1] || "", outRow);

    var lastBareWords = bareWords.slice(sspPoint);

    outRow.genus = bareWords[0];

    if (lastBareWords.length === 0) {
        outRow.taxonRank = "genus";
    } else if (lastBareWords.length === 1) {
        outRow.specificEpithet = lastBareWords[0];
        outRow.taxonRank = "species";
    } else if (lastBareWords.length === 2) {
        outRow.specificEpithet = lastBareWords[0];
        outRow.infraspecificEpithet = lastBareWords[1];
        outRow.taxonRank = "subspecies";
    }

    outRow.identificationQualifier = useWords.slice(1).join(" ");
    outRow.scientificName = [outRow.genus, ...lastBareWords].join(" ");

};

// Variant for summaries
hortis.extractSsp = function (name, outRow) {
    var words = name.split(" ");

    if (words.length === 3) {
        var maybeSsp = words[2];
        if (maybeSsp.startsWith("complex")
            || maybeSsp.startsWith("agg")
            || maybeSsp.startsWith("s.lat.")
            || words[1].startsWith("cf")) {
            outRow.Species = words[1] + " " + maybeSsp;
        } else {
            outRow.Species = words[1];
            outRow.Subspecies = maybeSsp;
        }
    } else if (words.length === 2) {
        outRow.Species = words[1];
    } else {
        fluid.fail("Unexpected species name " + name);
    }
};

/* Accepts a row of a summary, and the column structure inside "Taxa" */

hortis.mapTaxaRows = function (rows, columns) {
    return fluid.transform(rows, function (row) {
        var togo = {};
        fluid.each(columns, function (template, target) {
            togo[target] = hortis.stringTemplate(template, row);
        });
        if (row.species !== "" || row.genus !== "") {
            var degenified = hortis.extractGenus(row.taxonName, togo);
            hortis.extractSsp(degenified, togo);
        }
        return togo;
    });
};

// Also in coordinatePatch.js, leafletMap.js
hortis.datasetIdFromObs = function (obsId) {
    var colpos = obsId.indexOf(":");
    return obsId.substring(0, colpos);
};

hortis.stashMismatchedRow = function (mismatches, patchIndex, obsRow, summaryRow) {
    var key = obsRow.previousIdentifications + "|" + obsRow.scientificName;
    var patchRow = patchIndex[key];
    if (patchRow) {
        if (patchRow.Disposition === "P") {
            obsRow.scientificName = obsRow.previousIdentifications;
        } else if (patchRow.Disposition === "S") {
            var desp = obsRow.previousIdentifications.replace(" sp.", "");
            obsRow.scientificName = desp + " sp.";
        } else if (patchRow.Disposition === "X") {
            console.log("!!! Unexpected use of patch with key " + key);
        }
    } else {
        var existing = mismatches[key];
        if (!existing) {
            mismatches[key] = fluid.extend({
                previousIdentifications: obsRow.previousIdentifications
            }, summaryRow);
            console.log("Stashing mismatched row ", mismatches[key]);
        }
    }
};

hortis.badDates = {};

hortis.formatDate = function (row, template) {
    var togo = "";
    var format = template.substring("!Date:".length);
    // TODO: This should actually be applied in the data loader
    var momentVal = moment.tz(row.dateObserved, "Canada/Pacific");
    if (momentVal.isValid()) {
        // RBCM records claim to have a time but they don't
        var noTime = !row.dateObserved.includes("T") || row.dateObserved.includes("T00:00:00");
        togo = noTime && format.includes("H") ? "" : momentVal.format(format);
    } else {
        var obsId = row.observationId;
        if (!hortis.badDates[obsId]) {
            console.log("WARNING: row " + row.observationId + " has invalid date " + row.dateObserved);
        }
        hortis.badDates[obsId] = true;
    }
    return togo;
};

// TODO: Of course we need to pipeline the whole of ARPHA export
hortis.quantiseDepth = function (outRow, places) {
    var depth = outRow.verbatimDepth;
    if (depth === "o-86") {
        outRow.verbatimDepth = "0-86";
        outRow.minimumDepthInMeters = "0";
        outRow.maximumDepthInMeters = "86";
    } else {
        var togo = hortis.roundDecimals(depth, places);
        if (togo && isNaN(togo)) {
            console.log("WARNING: row " + outRow.occurrenceID + " has invalid depth " + depth);
        }
        outRow.verbatimDepth = togo;
    }
};

// Table of bad "count" entries from PMLS data
hortis.badCountTable = {
    "1 patc": "1 patch",
    "1tiny":  "1 tiny",
    "2 (pair0": "2",
    "2 larg": "2 large",
    "?": "",
    "`": "",
    "i": "",
    "-": "",
    "snall": "",
    "present": "",
    "NA": "",
    "white and cream": ""
};

// Technical reviewer recommendation 4
hortis.mapIndividualCount = function (outRow) {
    var count = outRow.individualCount;
    var lookup = hortis.badCountTable[count];
    var mapped = lookup === undefined ? count : lookup;
    if (mapped && !hortis.isInteger(mapped)) {
        outRow.occurrenceRemarks = "Count: " + mapped;
        outRow.individualCount = "";
    } else {
        outRow.individualCount = mapped;
    }
};

hortis.normaliseRecorders = function (recordedBy) {
    // Technical reviewer recommendation 5
    var separators = recordedBy.replace("; ", " | ").trim();
    // Technical reviewer recommendation 6
    var togo = separators === "anonymous" ? "" : separators;
    return togo;
};

hortis.mapMaterialsRows = function (rows, patchIndex, materialsMap, references, columns) {
    return fluid.transform(rows, function (row) {
        var togo = {};
        var dataset = hortis.datasetIdFromObs(row.observationId);
        var summaryRow = materialsMap.summaryIndex[row.iNaturalistTaxonId];
        var termMap = fluid.extend({}, row, {
            summary: summaryRow
        });
        // row.scientificName = summaryRow ? summaryRow.taxonName : "";
        var refBlock = references[dataset];
        fluid.each(columns, function (template, target) {
            var outVal = "";
            if (refBlock && refBlock[target]) {
                outVal = refBlock[target];
            }
            if (template.startsWith("!references.")) {
                var ref = template.substring("!references.".length);
                outVal = refBlock && refBlock[ref] || "";
            } else if (template.startsWith("!Date:")) {
                outVal = hortis.formatDate(row, template);
            } else {
                outVal = hortis.stringTemplate(template, termMap) || outVal;
            }
            if (outVal === "Confidence: ") { // blatant special casing
                outVal = "";
            }
            togo[target] = outVal;
        });
        if (!togo.occurrenceID) {
            togo.occurrenceID = "imerss.org:" + row.observationId;
        }
        hortis.quantiseDepth(togo, 2);
        hortis.mapIndividualCount(togo);

        if (row.coordinatesCorrected === "yes") {
            togo.georeferencedBy = "Andrew Simon";
            togo.georeferenceProtocol = "interpretation of locality, and/or inference based on local knowledge and species ecology";
            togo.georeferenceVerificationStatus = "corrected";
            togo.georeferenceRemarks = row.coordinatesCorrectedNote;
        }
        // Note that previousIdentifications is taken from the row's own "taxonName" field from the original obs
        if (togo.scientificName !== togo.previousIdentifications) {
            hortis.stashMismatchedRow(materialsMap.mismatches, patchIndex, togo, summaryRow);
        }
        hortis.extractQualifier(togo.scientificName, togo);

        var filename = hortis.WoRMSTaxa.filenameFromTaxonName(WoRMSTaxonAPIFileBase, row.iNaturalistTaxonName);
        var wormsRec = hortis.readJSONSync(filename);
        togo.taxonID = "WoRMS:" + wormsRec.AphiaID;

        togo.recordedBy = hortis.normaliseRecorders(togo.recordedBy);
        togo.georeferencedBy = hortis.normaliseRecorders(togo.georeferencedBy);
        return togo;
    });
};

hortis.writeSheet = function (workbook, sheetName, rows) {
    var sheet = workbook.addWorksheet(sheetName);
    var keys = Object.keys(rows[0]);
    var header = sheet.getRow(1);
    keys.forEach(function (key, index) {
        header.getCell(index + 1).value = key;
    });
    rows.forEach(function (row, rowIndex) {
        var sheetRow = sheet.getRow(rowIndex + 2);
        keys.forEach(function (key, index) {
            sheetRow.getCell(index + 1).value = row[key];
        });
    });
};

hortis.writeExcel = function (sheets, key, outputDir) {
    if (sheets.Taxa.length === 0) {
        console.log("Skipping key " + key + " since no rows were selected");
        return fluid.promise().resolve();
    }
    var workbook = new ExcelJS.Workbook();

    fluid.each(sheets, function (sheet, sheetName) {
        hortis.writeSheet(workbook, sheetName, sheet);
    });

    var filename = outputDir + "/" + key + ".xlsx";
    var togo = workbook.xlsx.writeFile(filename);
    togo.then(function () {
        var stats = fs.statSync(filename);
        console.log("Written " + stats.size + " bytes to " + filename);
    });
    return togo;
};

hortis.indexSummary = function (summaryRows) {
    var togo = {};
    summaryRows.forEach(function (row) {
        togo[row.iNaturalistTaxonId] = row;
    });
    return togo;
};

hortis.indexPatchRows = function (patchRows) {
    var togo = {};
    patchRows.forEach(function (row) {
        togo[row.previousIdentifications + "|" + row.taxonName] = row;
    });
    return togo;
};

// TODO: Worry if obs and summaries diverge in taxonomy
hortis.filterArphaRows = function (rows, rec, rowCount) {
    return rows.filter(function (row, index) {
        var parsed = hortis.expr.parse(rec.filter);
        var match = hortis.expr.evaluate(parsed, row);
        if (match) {
            ++rowCount[index];
        }
        return match;
    });
};

// Note - argument modified
hortis.sortRows = function (rows, sortBy) {
    var comparator = function (ra, rb) {
        return fluid.find(sortBy, function (column) {
            return ra[column] > rb[column] ? 1 : (ra[column] < rb[column] ? -1 : undefined);
        });
    };
    rows.sort(comparator);
};

hortis.verifyCounts = function (name, rowCount, rows) {
    rowCount.forEach(function (count, index) {
        if (count !== 1) {
            console.log("Anomalous " + name + " count for row " + index + ": " + count);
            console.log("Row contents: ", rows[index]);
        }
    });
};

hortis.eliminateEmptyColumns = function (rows) {
    var hasValue = {};
    rows.forEach(function (row) {
        fluid.each(row, function (value, key) {
            if (fluid.isValue(value) && value !== "") {
                hasValue[key] = true;
            }
        });
    });
    var valueKeys = Object.keys(hasValue);
    var togo = fluid.transform(rows, function (row) {
        return fluid.filterKeys(row, valueKeys);
    });
    return togo;
};

var completion = fluid.promise.sequence([summaryReader.completionPromise, obsReader.completionPromise, patchReader.completionPromise]);

completion.then(function () {
    var summaryRows = summaryReader.rows;
    console.log("Summary Input: " + summaryRows.length + " rows");
    var summaryRowCount = fluid.generate(summaryRows.length, 0);
    var obsRows = obsReader.rows;
    console.log("Obs Input: " + obsRows.length + " rows");
    var obsRowCount = fluid.generate(obsRows.length, 0);
    var summaryIndex = hortis.indexSummary(summaryRows);
    var patchRows = patchReader.rows;
    console.log("Patch Input: " + patchRows.length + " rows");
    var patchIndex = hortis.indexPatchRows(patchRows);
    var materialsMap = {
        summaryIndex: summaryIndex,
        mismatches: {}
    };
    var now = Date.now();
    var allMaterials = [];
    var outs = fluid.transform(pipeline.files, function (rec, key) {
        var outSummaryRows = hortis.filterArphaRows(summaryRows, rec, summaryRowCount);
        console.log("Extracted " + outSummaryRows.length + " summary rows via filter " + key);

        var Taxa = pipeline.sheets.Taxa;
        var taxaRows = hortis.mapTaxaRows(outSummaryRows, Taxa.columns);
        hortis.sortRows(taxaRows, Taxa.sortBy);

        var outObsRows = hortis.filterArphaRows(obsRows, rec, obsRowCount);
        console.log("Extracted " + outObsRows.length + " obs rows via filter " + key);

        var materialsRows = hortis.mapMaterialsRows(outObsRows, patchIndex, materialsMap, pipeline.references, pipeline.sheets.Materials.columns);

        // ARPHA can't actually accept this many Materials rows - we will export them to CSV instead
        allMaterials = allMaterials.concat(materialsRows);

        return {
            Taxa: taxaRows,
            Materials: [fluid.copy(pipeline.sheets.Materials.columns)],
            ExternalLinks: [fluid.copy(pipeline.sheets.ExternalLinks.columns)]
        };
    });
    console.log("Total extracted obs rows: " + fluid.flatten(fluid.getMembers(outs, "Materials")).length);
    console.log("Filtered obs in " + (Date.now() - now) + " ms");
    hortis.verifyCounts("summary", summaryRowCount, summaryRows);
    hortis.verifyCounts("obs", obsRowCount, obsRows);
    var mismatches = Object.values(materialsMap.mismatches);
    if (mismatches.length > 0) {
        console.log("Writing " + mismatches.length + " mismatched rows to arphaMismatches.csv");
        hortis.writeCSV("arphaMismatches.csv", ["previousIdentifications", "taxonName"].concat(Object.keys(fluid.censorKeys(summaryRows[0], ["taxonName"]))), mismatches, fluid.promise());
    }

    hortis.sortRows(allMaterials, pipeline.sheets.Materials.sortBy);
    var filteredMaterials = hortis.eliminateEmptyColumns(allMaterials);
    hortis.writeCSV(outputDir + "/Materials.csv", Object.keys(filteredMaterials[0]), filteredMaterials, fluid.promise());

    fluid.each(outs, function (sheets, key) {
        hortis.writeExcel(sheets, key, outputDir);
    });
}, function (err) {
    console.log("Error ", err);
});
