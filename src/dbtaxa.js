/* eslint-env node */

"use strict";

const fluid = require("infusion");
const fs = require("fs");

require("./dataProcessing/readJSON.js");
require("./iNaturalist/taxonAPI.js");

const glob = require("glob");

const taxonAPIFileBase = "data/iNaturalist/taxonAPI";

const hortis = fluid.registerNamespace("hortis");

const now = Date.now();

const dataFiles = glob.sync(taxonAPIFileBase + "/*.json");

console.log("Found " + dataFiles.length + " taxon files in " + (Date.now() - now) + "ms");

hortis.idFromFilename = function (filename) {
    const lastslash = filename.lastIndexOf("/");
    const lastdot = filename.lastIndexOf(".");
    return filename.substring(lastslash + 1, lastdot);
};

hortis.padTaxonId = function (id) {
    return id.padStart(8, "0");
};

const source = hortis.iNatTaxonAPI.dbSource();

async function traverseDB() {

    const beforeWrite = Date.now();

    const writeAll = async function (dataFiles) {
        for (let i = 0; i < dataFiles.length; ++i) {
            const dataFile = dataFiles[i];
            const contents = hortis.readJSONSync(dataFile);
            const stats = fs.statSync(dataFile);
            const toWrite = {
                fetched_at: stats.mtime.toISOString(),
                doc: contents
            };
            await source.set({id: contents.id}, toWrite);
            if (i % 1000 === 0) {
                process.stdout.write(i + " ... ");
            }
        }
    };

    await writeAll(dataFiles);

    console.log("\nWritten " + dataFiles.length + " taxon files in " + (Date.now() - beforeWrite) + "ms");

    const readAll = async function () {
        let index = 0;
        let first = true;
        const db = source.level;
        for await (const key of db.keys()) {
            if (index % 100 === 0) {
                process.stdout.write("\"" + key + "\" ");
            }
            const doc = JSON.parse(await db.get(key));
            if (first) {
                console.log("First doc: ", doc);
                first = false;
            }
            ++index;
        }
    };

    await readAll();
}

traverseDB().catch(function (err) {
    console.log("Error traversing database ", err);
});
