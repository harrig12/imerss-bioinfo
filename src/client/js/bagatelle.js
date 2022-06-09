/*
Copyright 2017 Antranig Basman
Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.
You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/* global lz4 */

"use strict";

var hortis = fluid.registerNamespace("hortis");

fluid.setLogging(true);

fluid.defaults("hortis.configHolder", {
    gradeNames: "fluid.component"
});

fluid.defaults("hortis.sunburstLoader", {
    gradeNames: ["fluid.viewComponent", "fluid.resourceLoader", "hortis.configHolder"],
    sunburstPixels: 1002,
    markupTemplate: "%resourceBase/html/bagatelle.html",
    phyloMap: "%resourceBase/json/phyloMap.json",
    resourceBase: "src/client",
    queryOnStartup: "",
    selectOnStartup: "",
    showObsListInTooltip: true,
    resourceOptions: {
        terms: {
            resourceBase: "{that}.options.resourceBase"
        }
    },
    resources: {
        viz: {
            url: "{that}.options.vizFile",
            dataType: "binary",
            options: {
                processData: false,
                responseType: "arraybuffer"
            }
        },
        markup: {
            url: "{that}.options.markupTemplate",
            dataType: "text"
        },
        phyloMap: {
            url: "{that}.options.phyloMap",
            dataType: "json"
        }
    },
    invokers: {
        resolveColourStrategy: "hortis.resolveColourStrategy({that}.options.colourCount)"
    },
    listeners: {
        "onResourcesLoaded.renderMarkup": {
            priority: "first",
            listener: "hortis.sunburstLoader.renderMarkup",
            args: ["{that}.container", "{that}.resources.markup.resourceText", "{that}.options.renderMarkup", {
                sunburstPixels: "{that}.options.sunburstPixels"
            }]
        }
    },
    components: {
        sunburst: {
            type: "hortis.sunburst",
            createOnEvent: "onResourcesLoaded",
            options: {
                container: "{sunburstLoader}.container",
                gradeNames: "{sunburstLoader}.resolveColourStrategy",
                colourCount: "{sunburstLoader}.options.colourCount",
                culturalValues: "{sunburstLoader}.options.culturalValues",
                queryOnStartup: "{sunburstLoader}.options.queryOnStartup",
                selectOnStartup: "{sunburstLoader}.options.selectOnStartup",
                members: {
                    viz: "@expand:hortis.decompressLZ4({sunburstLoader}.resources.viz.resourceText)",
                    tree: "{that}.viz.tree"
                },
                model: {
                    commonNames: "{sunburstLoader}.options.commonNames"
                }
            }
        }
    }
});

hortis.resolveResources = function (resources, terms) {
    var mapped = fluid.transform(resources, function (oneResource) {
        return fluid.extend(true, {}, oneResource, {
            url: fluid.stringTemplate(oneResource.url, terms)
        });
    });
    return mapped;
};

hortis.decompressLZ4 = function (arrayBuffer) {
    var uint8in = new Uint8Array(arrayBuffer);
    var uint8out = lz4.decompress(uint8in);
    var text = new TextDecoder("utf-8").decode(uint8out);
    return JSON.parse(text);
};

hortis.combineSelectors = function () {
    return fluid.makeArray(arguments).join(", ");
};

hortis.sunburstLoader.renderMarkup = function (container, template, renderMarkup, terms) {
    if (renderMarkup) {
        var rendered = fluid.stringTemplate(template, terms);
        var fragment = document.createRange().createContextualFragment(rendered);
        var root = fragment.firstElementChild;
        while (root.firstChild) {
            container[0].appendChild(root.firstChild);
        }
    }
};

hortis.colouringGrades = {
    undocumentedCount: "fluid.component",
    observationCount: "hortis.sunburstWithObsColour"
};

hortis.resolveColourStrategy = function (countField) {
    return hortis.colouringGrades[countField];
};

fluid.defaults("hortis.sunburstWithObsColour", {
    gradeNames: "fluid.component",
    invokers: {
        fillColourForRow: "hortis.obsColourForRow({that}.options.parsedColours, {arguments}.0, {that}.flatTree.0)"
    }
});

fluid.defaults("hortis.bagatelleTabs", {
    gradeNames: "hortis.tabs",
    tabIds: {
        checklist: "fli-tab-checklist",
        sunburst: "fli-tab-sunburst"
    },
    model: {
        selectedTab: "checklist"
    }
});

// Holds model state shared with checklist and index
fluid.defaults("hortis.layoutHolder", {
    gradeNames: "fluid.modelComponent",
    members: {
        taxonHistory: []
    },
    model: {
        rowFocus: {},
        layoutId: null,
        selectedId: null,
        hoverId: null,
        historyIndex: 0
    }
});

fluid.defaults("hortis.withPanelLabel", {
    gradeNames: "fluid.viewComponent",
    selectors: {
        panelLabel: ".fld-bagatelle-panel-label"
    },
    model: {
        panelLabel: ""
    },
    modelRelay: {
        panelLabel: {
            source: "panelLabel",
            target: "dom.panelLabel.text"
        }
    }
});

// Note that sunburst's container is the overall fl-bagatelle-container, all of its contents related to the
// sunburst itself really need to be demoted
fluid.defaults("hortis.sunburst", {
    gradeNames: ["hortis.layoutHolder", "hortis.withPanelLabel", "fluid.viewComponent"],
    selectors: {
        panelLabel: "#fli-tab-sunburst .fld-bagatelle-panel-label", // irregularity due to faulty container level
        svg: ".flc-bagatelle-svg",
        back: ".fld-bagatelle-back",
        tabs: ".fld-bagatelle-tabs",
        taxonDisplay: ".fld-bagatelle-taxonDisplay",
        autocomplete: ".fld-bagatelle-autocomplete",
        checklist: ".fld-bagatelle-checklist-holder",
        simpleChecklist: ".fld-bagatelle-simple-checklist-holder",
        segment: ".fld-bagatelle-segment",
        label: ".fld-bagatelle-label",
        phyloPic: ".fld-bagatelle-phyloPic"
        // No longer supportable under FLUID-6145: BUG
        // mousable: "@expand:hortis.combineSelectors({that}.options.selectors.segment, {that}.options.selectors.label, {that}.options.selectors.phyloPic)"
    },
    styles: {
        segment: "fld-bagatelle-segment",
        label: "fld-bagatelle-label",
        phyloPic: "fld-bagatelle-phyloPic",
        layoutRoot: "fl-bagatelle-layoutRoot",
        labelPath: "fld-bagatelle-labelPath",
        clickable: "fl-bagatelle-clickable"
    },
    components: {
        autocomplete: {
            type: "hortis.autocomplete",
            options: {
                container: "{sunburst}.dom.autocomplete",
                id: "fli-bagatelle-autocomplete",
                listeners: {
                    onConfirm: "hortis.confirmAutocomplete({sunburst}, {arguments}.0)"
                },
                invokers: {
                    //                                                   query,         callback
                    query: "hortis.queryAutocomplete({that}.lookupTaxon, {arguments}.0, {arguments}.1)",
                    lookupTaxon: "{sunburst}.lookupTaxon({arguments}.0, {that}.options.maxSuggestions)",
                    renderInputValue: "hortis.autocompleteInputForRow",
                    renderSuggestion: "hortis.autocompleteSuggestionForRow"
                }
            }
        },
        tabs: {
            type: "hortis.bagatelleTabs",
            options: {
                container: "{sunburst}.dom.tabs",
                modelRelay: {
                    sunburstVisible: {
                        target: "{sunburst}.model.visible",
                        func: tab => tab === "sunburst",
                        args: "{tabs}.model.selectedTab"
                    }
                }
            }
        },
        checklist: {
            type: "hortis.checklist",
            options: {
                container: "{sunburst}.dom.checklist"
            }
        },
        simpleChecklist: {
            type: "hortis.checklist",
            options: {
                container: "{sunburst}.dom.simpleChecklist",
                filterRanks: ["phylum", "class", "order", "species"]
            }
        }
    },
    colours: {
        lowColour: "#9ecae1",
        highColour: "#e7969c",
        unfocusedColour: "#ddd"
    },
    zoomDuration: 1250,
    scaleConfig: {
        // original settings 1 and 12
        innerDepth: 1 / 22,
        outerDepth: 13 / 22,
        rootRadii: [3 / 22,
            3 / 22,
            3 / 22,
            13 / 22],
        maxNodes: 200
    },
    parsedColours: "@expand:hortis.parseColours({that}.options.colours)",
    colourCount: "undocumentedCount",
    culturalValues: true,
    model: {
        scale: {
            left: 0,
            right: 0,
            radiusScale: []
        },
        // From layoutHolder base grade:
        // layoutId: id of segment at layout root
        // hoverId: id of segment being hovered, giving rise to tooltip
        // selectedId: id of row for taxon display
        // rowFocus: {} - rows "focused" as a result of, e.g. map
        visible: false,
        commonNames: true
    },
    modelRelay: {
        isAtRoot: {
            target: "isAtRoot",
            func: "hortis.isAtRoot",
            args: ["{that}", "{that}.model.layoutId"]
        },
        backEnabled: {
            target: "dom.back.attr.aria-disabled",
            func: index => index < 2,
            args: "{that}.model.historyIndex"
        }
    },
    markup: {
        segmentHeader: "<g xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">",
        segment: "<path id=\"%id\" d=\"%path\" visibility=\"%visibility\" class=\"%clazz\" vector-effect=\"non-scaling-stroke\" style=\"%style\"></path>",
        // dominant-baseline fails on some old Chromium and AS machines
        label: "<path id=\"%labelPathId\" d=\"%textPath\" visibility=\"%labelVisibility\" class=\"%labelPathClass\" vector-effect=\"non-scaling-stroke\"></path>"
            + "<text id=\"%labelId\" dy=\"0.25em\" class=\"%labelClass\" visibility=\"%labelVisibility\" style=\"%labelStyle\">"
            + "<textPath xlink:href=\"#%labelPathId\" startOffset=\"50%\" style=\"text-anchor: middle\">%label</textPath></text>",
        phyloPic: "<image id=\"%phyloPicId\" class=\"%phyloPicClass fl-bagatelle-clickable\" xlink:href=\"%phyloPicUrl\" height=\"%diameter\" width=\"%diameter\" x=\"%phyloPicX\" y=\"%phyloPicY\" />",
        segmentFooter: "</g>",
        taxonDisplayHeader: "<div>",
        taxonDisplayRow: "<div %rootAttrs><span class=\"fl-taxonDisplay-key\">%key</span><span class=\"fl-taxonDisplay-value %valueClazz\">%value</span></div>",
        taxonDisplayFooter: "</div>"
    },
    events: {
        changeLayoutId: null
    },
    invokers: {
        render: "hortis.render({that})",
        renderLight: "hortis.renderLight({that})",
        renderSegment: "hortis.renderSegment({that}, {arguments}.0, {arguments}.1)",
        angleScale: "hortis.angleScale({arguments}.0, {that}.model.scale)",
        elementToRow: "hortis.elementToRow({that}, {arguments}.0)",
        segmentClicked: "hortis.segmentClicked({that}, {arguments}.0)",
        fillColourForRow: "hortis.undocColourForRow({that}.options.parsedColours, {arguments}.0)",
        getMousable: "hortis.combineSelectors({that}.options.selectors.segment, {that}.options.selectors.label, {that}.options.selectors.phyloPic)",
        lookupTaxon: "hortis.lookupTaxon({that}.flatTree, {arguments}.0, {arguments}.1)"
    },
    modelListeners: {
        scale: {
            excludeSource: "init",
            func: "{that}.renderLight"
        },
        selectedId: [{
            namespace: "updateTaxonDisplay",
            excludeSource: "init",
            funcName: "hortis.updateTaxonDisplay",
            args: ["{that}", "{change}.value"]
        }, {
            namespace: "renderLight",
            excludeSource: "init",
            func: "{that}.renderLight"
        }],
        hoverId: {
            excludeSource: "init",
            funcName: "hortis.updateTooltip",
            args: ["{that}", "{change}.value"]
        },
        rowFocus: {
            funcName: "hortis.updateRowFocus",
            args: ["{that}", "{change}.value", "{change}.transaction"]
        },
        backClick: {
            path: "dom.back.click",
            funcName: "hortis.backTaxon",
            args: ["{that}"]
        }
    },
    listeners: {
        "onCreate.doLayout": {
            func: "hortis.doLayout",
            args: ["{that}.flatTree"]
        },
        "onCreate.computeInitialScale": {
            funcName: "hortis.computeInitialScale",
            args: ["{that}"],
            priority: "after:doLayout"
        },
        "onCreate.boundNodes": {
            funcName: "hortis.boundNodes",
            args: ["{that}", "{that}.model.layoutId", true],
            priority: "before:render"
        },
        "onCreate.applyPhyloMap": {
            funcName: "hortis.applyPhyloMap",
            args: ["{sunburstLoader}.resources.phyloMap.parsed", "{that}.flatTree", "{sunburstLoader}.options.resourceOptions.terms"],
            priority: "before:computeInitialScale"
        },
        "onCreate.render": {
            func: "{that}.render",
            priority: "after:computeInitialScale"
        },
        "onCreate.bindSunburstMouse": {
            funcName: "hortis.bindSunburstMouse",
            args: ["{that}"]
        },
        "onCreate.bindRowExpander": {
            funcName: "hortis.bindRowExpander",
            args: ["{that}"]
        },
        // Naturally in "future Infusion" this would be a single chain event with beginZoom as the last listener
        //                                                            layoutId,      source
        "changeLayoutId.updateModel": "hortis.changeLayoutId({that}, {arguments}.0, {arguments}.1)"
    },
    members: {
        visMap: [], // array of visibility aligned with flatTree
        tree: null,
        flatTree: "@expand:hortis.flattenTree({that}.tree)",
        maxDepth: "@expand:hortis.computeMaxDepth({that}.flatTree)",
        index: "@expand:hortis.indexTree({that}.flatTree)" // map id to row
    }
});


hortis.capitalize = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
};

hortis.autocompleteInputForRow = function (row) {
    return row ? hortis.labelForRow(row) + (row.commonName ? " (" + row.commonName + ")" : "") : row;
};

hortis.autocompleteSuggestionForRow = function (row) {
    return hortis.autocompleteInputForRow(row) + (row.childCount > 1 ? " (" + row.childCount + " species)" : "");
};

hortis.lookupTaxon = function (flatTree, query, maxSuggestions) {
    maxSuggestions = maxSuggestions || 1;
    var output = [];
    query = query.toLowerCase();
    for (var i = 0; i < flatTree.length; ++i) {
        var row = flatTree[i];
        var display = hortis.autocompleteInputForRow(row);
        if (display.toLowerCase().indexOf(query) !== -1) {
            output.push(row);
        }
        if (output.length >= maxSuggestions) {
            break;
        }
    };
    return maxSuggestions === 1 ? output[0] : output;
};

hortis.queryAutocomplete = function (lookupTaxon, query, callback) {
    var output = lookupTaxon(query);
    callback(output);
};

hortis.confirmAutocomplete = function (that, row) {
    if (row) { // on blur it may send nothing
        that.events.changeLayoutId.fire(row.id);
    }
};

hortis.rowToPhyloIndex = function (row) {
    return row.rank + ":" + row.iNaturalistTaxonName;
};

hortis.colourChildren = function (row, parsed) {
    row.lowColour = parsed.lowColour;
    row.highColour = parsed.highColour;
    row.children.forEach(function (child) {
        hortis.colourChildren(child, parsed);
    });
};

hortis.applyPhyloMap = function (phyloMap, rows, terms) {
    var parsedMap = fluid.transform(phyloMap, function (onePhylo) {
        var togo = {};
        if (onePhylo.pic) {
            togo.phyloPicUrl = fluid.stringTemplate(onePhylo.pic, terms);
        }
        if (onePhylo.taxonPic) {
            togo.taxonPic = fluid.stringTemplate(onePhylo.taxonPic, terms);
        }
        togo.taxonPicDescription = onePhylo.taxonPicDescription;
        if (onePhylo.colour) {
            var parsedColour = fluid.colour.hexToArray(onePhylo.colour);
            var hsl = fluid.colour.rgbToHsl(parsedColour);
            togo.lowColour = fluid.colour.hslToRgb([hsl[0], hsl[1], hsl[2] * 0.2 + 0.8]);
            togo.highColour = fluid.colour.hslToRgb([hsl[0], hsl[1], hsl[2] * 0.8 + 0.2]);
        }
        return togo;
    });
    rows.forEach(function (row) {
        var phyloIndex = hortis.rowToPhyloIndex(row);
        var parsed = parsedMap[phyloIndex];
        if (parsed) {
            row.phyloPicUrl = parsed.phyloPicUrl;
            row.taxonPic    = parsed.taxonPic;
            row.taxonPicDescription = parsed.taxonPicDescription;
            hortis.colourChildren(row, parsed);
        }
    });
};

hortis.taxonDisplayLookup = {
    iNaturalistTaxonName: "Taxon Name:",
    observationCount: "Observation Count:",
    iNaturalistObsLink: "Observation:",
    taxonLink: "iNaturalist Taxon:",
    commonName: "Common Name:",
    wikipediaSummary: "Wikipedia Summary",
    iNaturalistTaxonImage: "iNaturalist Taxon Image:",
    phyloPic: "Taxon Icon:",
    taxonPic: "Taxon Picture:",
    taxonPicDescription: "Taxon Picture Description:"
};

hortis.commonFields = ["commonName", "wikipediaSummary"];

hortis.dumpRow = function (key, value, markup, extraClazz, valueClazz) {
    if (value) {
        var keyName = key ? (hortis.taxonDisplayLookup[key] || hortis.capitalize(key)) : "";
        var clazz = "fl-taxonDisplay-row " + (extraClazz || "");
        valueClazz = valueClazz || "";
        return fluid.stringTemplate(markup.taxonDisplayRow, {
            key: keyName,
            value: value,
            rootAttrs: "class=\"" + clazz + "\"",
            valueClazz: valueClazz
        });
    } else {
        return "";
    }
};

hortis.renderDate = function (date) {
    return new Date(date).toISOString().substring(0, 10);
};

hortis.expandButtonMarkup = "<span class=\"fl-taxonDisplay-expand fl-taxonDisplay-unexpanded\"></span>";

hortis.sourceTable = { // TODO: get this from marmalised.json but the names currently there are too long
    iNat: "iNaturalist",
    PMLS: "Pacific Marine Life Surveys",
    RBCM: "Royal British Columbia Museum",
    CMN: "Canadian Museum of Nature",
    BCCSN: "British Columbia Cetacean Sightings Network",
    "Gal-Salm": "Erickson",
    CHU2010: "Chu and Leys (2010)",
    CHU2012: "Chu and Leys (2012)",
    Hunterston: "Hunterston Farms BioBlitz 2010"
};

hortis.sourceFromId = function (obsId) {
    var colpos = obsId ? obsId.indexOf(":") : -1;
    return colpos === -1 ? null : obsId.substring(0, colpos);
};

// Render a set of fields derived from an "observation range" - group of fields prefixed by "first" and "last"
// including date/time/recordedBy/collection
hortis.renderObsBound = function (row, prefix, markup) {
    var date = row[prefix + "Timestamp"];
    if (date) {
        var capPrefix = prefix === "since" ? "" : hortis.capitalize(prefix);
        var recordedBy = row[prefix + "RecordedBy"];
        var catalogueNumber = row[prefix + "CatalogueNumber"];
        var value = hortis.renderDate(row[prefix + "Timestamp"]) + (recordedBy ? " by " + recordedBy : "");

        var row1 = hortis.dumpRow(capPrefix + (prefix === "since" ? " Observed:" : " Reported:"), value, markup);

        var collection = row[prefix + "Collection"];
        var obsIdCollection = hortis.sourceFromId(row[prefix + "ObservationId"]);
        var renderedCollection = hortis.sourceTable[obsIdCollection || collection] || collection;

        var source = renderedCollection + (catalogueNumber ? " (" + catalogueNumber + ")" : "");

        var row2 = hortis.dumpRow("Source:", source, markup);
        return row1 + row2;
    } else {
        return "";
    }
};

hortis.drivePlayer = "<iframe frameborder=\"0\" width=\"360\" height=\"55\" src=\"%url\"></iframe>";

hortis.driveToPreview = function (url) {
    var lastSlash = url.lastIndexOf("/");
    return url.substring(0, lastSlash) + "/preview";
};

hortis.hulqValues = ["food", "medicinal", "spiritual", "material", "trade", "indicator"];

hortis.hulqValueItem = "<div class=\"fl-bagatelle-cultural-value\"><div role=\"img\" class=\"fld-bagatelle-value-%img fl-bagatelle-cultural-value-img\"></div><div class=\"fld-bagatelle-cultural-value-text\">%label</div></div>";

hortis.hulqValueBlock = "<div class=\"fl-bagatelle-cultural-values\">%valueBlocks</div>";

hortis.dumpHulqName = function (row, markup) {
    var player = row.audioLink ? fluid.stringTemplate(hortis.drivePlayer, {
        url: hortis.driveToPreview(row.audioLink)
    }) : "";
    var nameRow = hortis.dumpRow("Hul'qumi'num name", row.hulqName + player, markup);
    return nameRow;
};

hortis.dumpHulqValues = function (row, markup) {
    var valueBlocks = hortis.hulqValues.map(function (value) {
        return row[value + "Value"] === "1" ? value : "missing";
    }).map(function (img, index) {
        return fluid.stringTemplate(hortis.hulqValueItem, {
            img: img,
            label: hortis.hulqValues[index]
        });
    });
    var valueBlock = fluid.stringTemplate(hortis.hulqValueBlock, {
        valueBlocks: valueBlocks.join("\n")
    });

    var valueRow1 = hortis.dumpRow("Cultural values", " ", markup, "fl-taxonDisplay-empty-header");
    var valueRow2 = hortis.dumpRow("", valueBlock, markup, "fl-taxonDisplay-empty-row");
    return valueRow1 + valueRow2;
};

hortis.iNatExtern = "<a href=\"%iNatLink\" target=\"_blank\" class=\"fl-taxonDisplay-iNat-extern\">iNaturalist<span class=\"fl-external-link\"></span></a>";



hortis.imageTemplate =
    "<div class=\"fl-taxonDisplay-image-holder\">" +
        "<div class=\"fl-bagatelle-photo\" style=\"background-image: url(%imgUrl)\"/>" +
        "%iNatExtern" +
    "</div></div>";

hortis.idToTaxonLink = function (taxonId) {
    return "https://www.inaturalist.org/taxa/" + taxonId;
};

hortis.renderTaxonDisplay = function (row, markup, options) {
    if (!row) {
        return null;
    }
    var togo = markup.taxonDisplayHeader;
    var dumpRow = function (keyName, value, extraClazz) {
        if (keyName === "wikipediaSummary" && value) {
            var row1 = hortis.dumpRow("Wikipedia Summary", hortis.expandButtonMarkup, markup, "fld-taxonDisplay-expandable-header fl-taxonDisplay-runon-header");
            var row2 = hortis.dumpRow("", value, markup, "fld-taxonDisplay-expandable-remainder fl-taxonDisplay-runon-remainder", "fl-taxonDisplay-wikipediaSummary");
            togo += row1 + row2;
        } else {
            togo += hortis.dumpRow(keyName, value, markup, extraClazz);
        }
    };
    var dumpImage = function (keyName, url, taxonId) {
        var imageMarkup = fluid.stringTemplate(hortis.imageTemplate, {
            imgUrl: url,
            iNatExtern: taxonId ? fluid.stringTemplate(hortis.iNatExtern, {
                iNatLink: hortis.idToTaxonLink(taxonId)
            }) : ""
        });
        // TODO: key name is currently ignored - other types of images, e.g. phylopics, and obs images, can't be distinguished
        togo += imageMarkup;
    };
    var dumpPhyloPic = function (keyName, url) {
        togo += hortis.dumpRow(keyName, "<div><img height=\"150\" width=\"150\" class=\"fl-bagatelle-photo\" src=\"" + url + "\"/></div>", markup);
    };
    if (row.rank) {
        if (row.iNaturalistTaxonImage && !row.taxonPic) {
            dumpImage("iNaturalistTaxonImage", row.iNaturalistTaxonImage, row.iNaturalistTaxonId);
        } else if (row.taxonPic) {
            dumpImage("taxonPic", row.taxonPic);
        }
        if (row.phyloPicUrl) {
            dumpPhyloPic("phyloPic", row.phyloPicUrl);
        }
        dumpRow(row.rank, row.iNaturalistTaxonName, "fl-taxonDisplay-rank");
        hortis.commonFields.forEach(function (field) {
            dumpRow(field, row[field]);
        });
        dumpRow("taxonPicDescription", row.taxonPicDescription);
        dumpRow("Species:", row.childCount);
        dumpRow("observationCount", row.observationCount);
    } else {
        if (row.iNaturalistTaxonImage && !row.obsPhotoLink) {
            dumpImage("iNaturalistTaxonImage", row.iNaturalistTaxonImage, row.iNaturalistTaxonId);
        }
        if (row.species) {
            dumpRow("Species:", row.species + (row.authority ? (" " + row.authority) : ""), "fl-taxonDisplay-rank");
        } else {
            dumpRow("iNaturalistTaxonName", row.iNaturalistTaxonName);
        }
        if (row.hulqName) { // wot no polymorphism?
            togo += hortis.dumpHulqName(row, markup);
        }
        dumpRow("commonName", row.commonName);

        if (row.hulqName && options.culturalValues) { // wot no polymorphism?
            togo += hortis.dumpHulqValues(row, markup);
        }

        dumpRow("wikipediaSummary", row.wikipediaSummary);
        var obsPanel = "";

        obsPanel += hortis.renderObsBound(row, "first", markup);
        obsPanel += hortis.renderObsBound(row, "last", markup);
        obsPanel += hortis.renderObsBound(row, "since", markup);

        if (row.iNaturalistObsLink) {
            obsPanel += hortis.dumpRow("iNaturalistObsLink", "<a href=\"" + row.iNaturalistObsLink + "\">" + row.iNaturalistObsLink + "</a>", markup);
        }
        obsPanel += hortis.dumpRow("observationCount", row.observationCount, markup);
        togo += hortis.dumpRow("Observation Data", hortis.expandButtonMarkup, markup, "fld-taxonDisplay-expandable-header");
        togo += hortis.dumpRow("", obsPanel, markup, "fld-taxonDisplay-expandable-remainder fl-taxonDisplay-runon-remainder");

        if (row.obsPhotoLink) {
        // See this nonsense: https://stackoverflow.com/questions/5843035/does-before-not-work-on-img-elements
            dumpImage("Observation photo", row.obsPhotoLink);
        }

        /** Axed per AS email 16/10/21
        var iNatId = row.iNaturalistTaxonId;
        if (iNatId) {
            var taxonLink = "http://www.inaturalist.org/taxa/" + iNatId;
            dumpRow("taxonLink", "<a href=\"" + taxonLink + "\">" + taxonLink + "</a>");
        }*/
    }

    togo += markup.taxonDisplayFooter;
    return togo;
};

hortis.bindRowExpander = function () {
    $(document).on("click", ".fl-taxonDisplay-expand", function (e) {
        var target = $(e.target);
        target.toggleClass("fl-taxonDisplay-expanded");
        target.toggleClass("fl-taxonDisplay-unexpanded");
        var showing = target.hasClass("fl-taxonDisplay-expanded");
        var header = target.closest(".fld-taxonDisplay-expandable-header");
        header.toggleClass("fl-taxonDisplay-expanded", showing);
        var siblings = header.parent().children();
        var ownIndex = header.index();
        var next = $(siblings[ownIndex + 1]);
        if (next.hasClass("fld-taxonDisplay-expandable-remainder")) { // sanity check, we should not render ones without this
            next[showing ? "show" : "hide"]();
        }
    });
};

hortis.updateTaxonDisplay = function (that, id) {
    var content = id ? hortis.renderTaxonDisplay(that.index[id], that.options.markup, that.options) : null;
    var taxonDisplay = that.locate("taxonDisplay");
    if (content) {
        taxonDisplay.empty();
        taxonDisplay.html(content);
    }
};

hortis.tooltipTemplate = "<div class=\"fl-bagatelle-tooltip\">" +
    "<div class=\"fl-bagatelle-photo\" style=\"background-image: url(%imgUrl)\"></div>" +
    "<div class=\"fl-text\"><b>%taxonRank:</b> %taxonNames</div>" +
    "</div>";

hortis.renderTooltip = function (row) {
    var terms = {
        imgUrl: row.iNaturalistTaxonImage || ""
    };
    if (row.rank) {
        terms.taxonRank = hortis.capitalize(row.rank);
    } else {
        terms.taxonRank = "Species";
    }
    var names = [row.iNaturalistTaxonName, row.commonName, row.hulqName].filter(name => name);
    terms.taxonNames = names.join(" / ");
    return fluid.stringTemplate(hortis.tooltipTemplate, terms);
};


// Lifted from Infusion Tooltip.js
hortis.isInDocument = function (node) {
    var dokkument = fluid.getDocument(node),
        container = node[0];
    // jQuery UI framework will throw a fit if we have instantiated a widget on a DOM element and then
    // removed it from the DOM. This apparently can't be detected via the jQuery UI API itself.
    return $.contains(dokkument, container) || dokkument === container;
};

hortis.clearAllTooltips = function (that) {
    hortis.clearTooltip(that);
    $(".ui-tooltip").remove();
    that.applier.change("hoverId", null);
};

hortis.clearTooltip = function (that) {
    var tooltipTarget = that.tooltipTarget;
    if (tooltipTarget) {
        that.tooltipTarget = null;
        if (hortis.isInDocument(tooltipTarget)) {
            console.log("Cleared tooltip");
            tooltipTarget.tooltip("destroy");
        } else {
            console.log("Tooltip target lost from document");
            hortis.clearAllTooltips(that);
        }
    }
};

hortis.updateTooltip = function (that, id) {
    var content = id ? hortis.renderTooltip(that.index[id], that.options.markup) : null;
    var target = $(that.mouseEvent.target);

    hortis.clearTooltip(that);

    if (content) {
        console.log("Opening tooltip for node " + id);
        target.tooltip({
            items: target
        });
        target.tooltip("option", "content", content || "");
        target.tooltip("option", "track", true);
        target.tooltip("open", that.mouseEvent);
        that.tooltipTarget = target;
    } else {
        that.mouseEvent = null;
    }
};

hortis.isAtRoot = function (that, layoutId) {
    return layoutId === that.flatTree[0].id;
};

hortis.bindSunburstMouse = function (that) {
    var svg = that.locate("svg");
    // var mousable = that.options.selectors.mousable;
    var mousable = that.getMousable();
    svg.on("click", mousable, function () {
        var id = hortis.elementToId(this);
        var row = that.index[id];
        if (!hortis.isAboveLayoutRoot(row, that) && that.index[id].phyloPicUrl) {
            row = that.flatTree[0];
        }
        that.segmentClicked(row);
    });
    svg.on("mouseenter", mousable, function (e) {
        var id = hortis.elementToId(this);
        that.mouseEvent = e;
        that.applier.change("hoverId", id);
    });
    svg.on("mouseleave", mousable, function () {
        that.applier.change("hoverId", null);
    });
};

hortis.parseColours = function (colours) {
    return fluid.transform(colours, function (colour) {
        return fluid.colour.hexToArray(colour);
    });
};


hortis.angleScale = function (index, scale) {
    var angle = 2 * Math.PI * (index - scale.left) / (scale.right - scale.left);
    return fluid.transforms.limitRange(angle, {min: 0, max: 2 * Math.PI});
};

hortis.outRings = function (array, count, width) {
    var lastRing = array[array.length - 1];
    for (var i = 0; i < count; ++i) {
        lastRing += width;
        array.push(lastRing);
    }
};

hortis.makeRadiusScale = function (innerRings, visRings, totalRings, scaleConfig, isAtRoot) {
    console.log("makeRadiusScale with innerRings ", innerRings, " visRings ", visRings);
    var togo = [0];
    if (isAtRoot && scaleConfig.rootRadii) {
        scaleConfig.rootRadii.forEach(function (radius) {
            hortis.outRings(togo, 1, 1000 * radius);
        });
        hortis.outRings(togo, 1 + totalRings - togo.length, 0);
    } else {
        // Allocate as many outerRings as we can without making in between rings narrower than innerDepth
        // Total amount available is 1 - innerRadius, in between thickness would be (1 - outerRings * options.outerDepth - innerRadius) / (totalRings - outerRings - innerRings);
        var outerRings = Math.floor((1 - visRings * scaleConfig.innerDepth) / (scaleConfig.outerDepth - scaleConfig.innerDepth));
        console.log("outerRings determined as ", outerRings);
        var middleRings = visRings - outerRings - innerRings;
        var middleDepth = (1 - outerRings * scaleConfig.outerDepth - innerRings * scaleConfig.innerDepth) / middleRings;

        hortis.outRings(togo, innerRings, 1000 * scaleConfig.innerDepth);
        hortis.outRings(togo, middleRings, 1000 * middleDepth);
        hortis.outRings(togo, outerRings, 1000 * scaleConfig.outerDepth);
        hortis.outRings(togo, totalRings - visRings, 0);
    }
    console.log("makeRadiusScale returning ", togo);
    return togo;
};

hortis.boundNodes = function (that, layoutId, isInit) {
    console.log("boundNodes beginning for node ", layoutId);
    var layoutRoot = that.index[layoutId],
        visMap = [];
    for (var i = 0; i < that.flatTree.length; ++i) {
        visMap[i] = 0;
    }
    for (var visUp = layoutRoot; visUp; visUp = visUp.parent) {
        visMap[visUp.flatIndex] = 1;
    }
    var totalNodes = 1, parents = [layoutRoot], depth;
    for (depth = layoutRoot.depth; depth < that.maxDepth; ++depth) {
        var directChildren = 0;
        parents.forEach(function (parent) {
            directChildren += parent.children.length;
        });
        if (directChildren > 0 && totalNodes + directChildren < that.options.scaleConfig.maxNodes) {
            var newParents = [];
            parents.forEach(function (parent) {
                parent.children.forEach(function (child) {
                    visMap[child.flatIndex] = 1;
                });
                newParents.push.apply(newParents, parent.children);
            });
            parents = newParents;
            totalNodes += directChildren;
        } else {
            break;
        }
    }
    var isAtRoot = hortis.isAtRoot(that, layoutId);
    var radiusScale = hortis.makeRadiusScale(layoutRoot.depth, depth + 1, that.maxDepth + 1, that.options.scaleConfig, isAtRoot);
    var togo = {
        visMap: visMap,
        scale: {
            left: layoutRoot.leftIndex,
            right: layoutRoot.leftIndex + layoutRoot.childCount,
            radiusScale: radiusScale
        }
    };
    console.log("boundNodes returning ", togo);
    if (isInit) {
        that.visMap = visMap;
        that.applier.change("scale", togo.scale);
    }
    return togo;
};

hortis.isClickable = function (row) {
    return row.children.length > 0 || row.iNaturalistLink || row.iNaturalistTaxonId;
};

hortis.elementClass = function (row, isSelected, styles, baseStyle) {
    return styles[baseStyle]
        + (hortis.isClickable(row) ? " " + styles.clickable : "")
        + (isSelected ? " " + styles.layoutRoot : "");
};

hortis.elementStyle = function (attrs, elementType) {
    var opacity = attrs.opacity === undefined ? "" : " opacity: " + attrs.opacity + ";";
    return elementType === "segment" ? "fill: " + attrs.fillColour + ";" + opacity : opacity;
};

hortis.phyloPicAttrMap = {
    visibility: "visibility",
    x: "phyloPicX",
    y: "phyloPicY",
    height: "diameter",
    width: "diameter"
};

hortis.renderLight = function (that) {
    that.flatTree.forEach(function (row, index) {
        if (that.visMap[index] || that.oldVisMap && that.oldVisMap[index]) {
            var attrs = hortis.attrsForRow(that, row);
            attrs.fillColour = that.fillColourForRow(row);
            var isSelected = row.id === that.model.selectedId;
            var segment = fluid.byId("hortis-segment:" + row.id);
            if (segment) {
                segment.setAttribute("d", attrs.path);
                segment.setAttribute("visibility", attrs.visibility);
                segment.setAttribute("class", hortis.elementClass(row, isSelected, that.options.styles, "segment"));
                segment.setAttribute("style", hortis.elementStyle(attrs, "segment"));
            }
            var labelPath = fluid.byId("hortis-labelPath:" + row.id);
            if (labelPath) {
                labelPath.setAttribute("d", attrs.textPath);
                labelPath.setAttribute("visibility", attrs.labelVisibility);
            }
            var label = fluid.byId("hortis-label:" + row.id);
            if (label) {
                label.setAttribute("visibility", attrs.labelVisibility);
                label.setAttribute("class", hortis.elementClass(row, isSelected, that.options.styles, "label"));
                label.setAttribute("style", hortis.elementStyle(attrs, "label"));
            }
            var pic = fluid.byId("hortis-phyloPic:" + row.id);
            if (pic) {
                fluid.each(hortis.phyloPicAttrMap, function (source, target) {
                    pic.setAttribute(target, attrs[source]);
                });
            }
        }
    });
};

hortis.renderSVGTemplate = function (template, terms) {
    return fluid.stringTemplate(template, terms);
};


hortis.interpolateModels = function (f, m1, m2) {
    return fluid.transform(m1, function (value, key) {
        if (typeof(value) === "number") {
            return (1 - f) * value + f * m2[key];
        } else if (fluid.isPlainObject(value)) {
            return hortis.interpolateModels(f, value, m2[key]);
        } else {
            return value;
        }
    });
};

hortis.undocColourForRow = function (parsedColours, row) {
    var undocFraction = 1 - row.undocumentedCount / row.childCount;
    var interp = fluid.colour.interpolate(undocFraction, row.highColour || parsedColours.highColour, row.lowColour || parsedColours.lowColour);
    return fluid.colour.arrayToString(interp);
};

hortis.obsColourForRow = function (parsedColours, row, rootRow) {
    var fraction = Math.pow(row.observationCount / rootRow.observationCount, 0.2);
    var interp = fluid.colour.interpolate(fraction, row.lowColour || parsedColours.lowColour, row.highColour || parsedColours.highColour);
    var focusProp = row.focusCount / row.childCount;
    var interp2 = fluid.colour.interpolate(focusProp, parsedColours.unfocusedColour, interp);
    return fluid.colour.arrayToString(interp2);
};

hortis.pathFromRoot = function (row) {
    var togo = [];
    while (row) {
        togo.unshift(row);
        row = row.parent;
    }
    return togo;
};

hortis.lcaRoot = function (parents) {
    var lcaRoot;
    for (var i = 0; ; ++i) {
        var commonValue = null;
        for (var key in parents) {
            var seg = parents[key][i];
            if (seg === undefined) {
                commonValue = null;
                break;
            } else if (commonValue === null) {
                commonValue = seg;
            } else if (commonValue !== seg) {
                commonValue = null;
                break;
            }
        }
        if (commonValue === null) {
            break;
        } else {
            lcaRoot = commonValue;
        }
    }
    return lcaRoot;
};

hortis.updateRowFocus = function (that, rowFocus, transaction) {
    var flatTree = that.flatTree;
    var focusAll = $.isEmptyObject(rowFocus);
    for (var i = flatTree.length - 1; i >= 0; --i) {
        var row = flatTree[i];
        var focusCount;
        if (focusAll || rowFocus[row.id]) {
            focusCount = row.childCount;
        } else {
            focusCount = row.children.reduce(function (sum, child) {
                return sum + child.focusCount;
            }, 0);
        }
        row.focusCount = focusCount;
    }
    var target;
    if (focusAll) {
        target = flatTree[0];
    } else {
        var parents = fluid.transform(rowFocus, function (troo, key) {
            return hortis.pathFromRoot(that.index[key]);
        });
        var lca = hortis.lcaRoot(parents);
        target = Object.keys(parents).length === 1 ? lca.parent : lca;
    }
    if (target.leftIndex !== undefined) { // Avoid trying to render before onCreate
        // We signal this to regions - need to avoid mutual action of resetting map and taxa, and we assume that
        // map is the only source of updateRowFocus
        if (!transaction.fullSources.map || !focusAll) {
            that.events.changeLayoutId.fire(target.id, "rowFocus");
        }
    }
};

hortis.elementToId = function (element) {
    var id = element.id;
    return id.substring(id.indexOf(":") + 1);
};

hortis.elementToRow = function (that, element) {
    var id = hortis.elementToId(element);
    return that.index[id];
};

hortis.backTaxon = function (that) {
    if (that.model.historyIndex > 1) {
        that.applier.change("historyIndex", that.model.historyIndex - 1);
        that.events.changeLayoutId.fire(that.taxonHistory[that.model.historyIndex - 1], true);
    }
};

hortis.changeLayoutId = function (that, layoutId, source) {
    console.log("changeLayoutId to layoutId ", layoutId);
    that.applier.change("selectedId", layoutId);
    var noHistory = !!source;
    if (!noHistory) {
        that.taxonHistory[that.model.historyIndex] = layoutId;
        that.applier.change("historyIndex", that.model.historyIndex + 1);
    }
    var row = that.index[layoutId];
    if (row.children.length === 0) {
        layoutId = that.model.layoutId;
    }
    if (layoutId !== that.model.layoutId || source) {
        if (!that.model.layoutId) { // Can't render without some initial valid layout
            that.applier.change("layoutId", layoutId);
        } else {
            return hortis.beginZoom(that, layoutId);
        }
    }
    return fluid.promise().resolve();
};

// TODO: Consider whether we should always update layoutId at the start of the interaction in case there's any
// collateral state that depends on this. Note that we defeat async interaction when sunburst is not visible
hortis.beginZoom = function (that, rowId) {
    that.container.stop(true, true);
    hortis.clearAllTooltips(that);
    var initialScale = fluid.copy(that.model.scale);
    var newBound = hortis.boundNodes(that, rowId);
    newBound.scale.zoomProgress = 1;
    console.log("Begin zoom to rowId " + rowId);
    var togo = fluid.promise();
    that.oldVisMap = that.visMap;
    that.visMap = newBound.visMap;
    that.render();
    that.container.animate({"zoomProgress": 1}, {
        easing: "swing",
        duration: that.model.visible ? that.options.zoomDuration : 0,
        step: function (zoomProgress) {
            var interpScale = hortis.interpolateModels(zoomProgress, initialScale, newBound.scale);
            that.applier.change("scale", interpScale);
        },
        complete: function () {
            console.log("Zoom complete");
            delete that.oldVisMap;
            that.container[0].zoomProgress = 0;
            that.applier.change("layoutId", rowId);
            that.applier.change("scale.zoomProgress", 0); // TODO: suppress render here
            that.render();
            togo.resolve();
        }
    });
    return togo;
};

hortis.segmentClicked = function (that, row) {
    that.events.changeLayoutId.fire(row.id);
};

hortis.nameOverrides = {
    "Chromista": "Chromists"
};

hortis.labelForRow = function (row, commonNames) {
    var name = commonNames && row.commonName ? row.commonName : row.iNaturalistTaxonName;
    if (row.hulqName) {
        name += " - " + row.hulqName;
    }
    name = hortis.nameOverrides[row.iNaturalistTaxonName] || name;
    return hortis.capitalize(name);
    // return row.rank ? (row.rank === "Life" ? "Life" : row.rank + ": " + name) : name;
};

// Returns true if the supplied row is either at the layout root or above it. Alternatively - can we get to the
// global root from the layout root without hitting this row - if so it is not "shadowing" us (and hence its phylopic
// should not go to the centre)
hortis.isAboveLayoutRoot = function (row, that) {
    var layoutId = that.model.layoutId;
    var layoutRow = that.index[layoutId];
    while (layoutRow) {
        if (layoutRow.id === row.id) {
            return false;
        }
        layoutRow = layoutRow.parent;
    }
    return true;
};

// This guide is a great one for "bestiary of reuse failures": https://www.visualcinnamon.com/2015/09/placing-text-on-arcs.html
// What the chaining method reduces one to who is unable to allocate any intermediate variables

hortis.attrsForRow = function (that, row) {
    var leftAngle = that.angleScale(row.leftIndex),
        rightAngle = that.angleScale(row.leftIndex + row.childCount),
        midAngle = (leftAngle + rightAngle) / 2,
        innerRadius = that.model.scale.radiusScale[row.depth],
        outerRadius = that.model.scale.radiusScale[row.depth + 1];
    var isAboveLayoutRoot = hortis.isAboveLayoutRoot(row, that);
    var isComplete = fluid.model.isSameValue(leftAngle, 0) && fluid.model.isSameValue(rightAngle, 2 * Math.PI);
    var isCircle = fluid.model.isSameValue(innerRadius, 0) && isComplete;
    var isVisible = !fluid.model.isSameValue(leftAngle, rightAngle) && !fluid.model.isSameValue(innerRadius, outerRadius);
    var isOuterSegment = fluid.model.isSameValue(outerRadius - innerRadius, that.options.scaleConfig.outerDepth * 1000);
    var label = hortis.labelForRow(row, that.model.commonNames);
    var outerLength = outerRadius * (rightAngle - leftAngle);
    // Note that only purpose of midRadius is to position phylopic
    var midRadius = (isCircle || !isAboveLayoutRoot) ? 0 : (innerRadius + outerRadius) / 2;
    var radius = outerRadius - midRadius;
    if (fluid.model.isSameValue(leftAngle, Math.PI)) {
        // Eliminate Chrome crash bug exhibited in https://amb26.github.io/svg-failure/ but apparently only on Windows 7!
        // Note that 1e-5 will be too small!
        leftAngle += 1e-4;
    }
    var labelVisibility = isOuterSegment ? outerLength > 45 : outerLength > label.length * 22; // TODO: make a guess of this factor from font size (e.g. 2/3 of it)
    var togo = {
        visibility: isVisible ? "visible" : "hidden",
        labelVisibility: isVisible && labelVisibility ? "visible" : "hidden",
        label: hortis.encodeHTML(label),
        phyloPicX: Math.cos(midAngle) * midRadius - radius,
        phyloPicY: -Math.sin(midAngle) * midRadius - radius,
        phyloPicUrl: row.phyloPicUrl,
        diameter: 2 * radius
    };
    if (isComplete) {
        togo.textPath = hortis.circularTextPath(outerRadius);
        if (isCircle) {
            togo.path = hortis.circularPath(outerRadius);
        } else {
            togo.path = hortis.annularPath(innerRadius, outerRadius);
        }
    } else {
        togo.textPath = isOuterSegment ? hortis.linearTextPath(leftAngle, rightAngle, innerRadius, outerRadius) : hortis.segmentTextPath(leftAngle, rightAngle, outerRadius);
        togo.path = hortis.segmentPath(leftAngle, rightAngle, innerRadius, outerRadius);
    }
    if (that.oldVisMap) {
        var index = row.flatIndex;
        if (!that.oldVisMap[index] && that.visMap[index]) {
            togo.opacity = that.model.scale.zoomProgress;
        } else if (that.oldVisMap[index] && !that.visMap[index]) {
            togo.opacity = 1 - that.model.scale.zoomProgress;
        }
    }
    return togo;
};

hortis.renderSegment = function (that, row) {
    var isSelected = row.id === that.model.selectedId;
    var terms = $.extend({
        id: "hortis-segment:" + row.id,
        labelPathId: "hortis-labelPath:" + row.id,
        labelId: "hortis-label:" + row.id,
        phyloPicId: "hortis-phyloPic:" + row.id,
        clazz: hortis.elementClass(row, isSelected, that.options.styles, "segment"),
        labelPathClass: that.options.styles.labelPath,
        phyloPicClass: that.options.styles.phyloPic,
        labelClass: hortis.elementClass(row, isSelected, that.options.styles, "label"),
        fillColour: that.fillColourForRow(row)
    }, hortis.attrsForRow(that, row));
    terms.style = hortis.elementStyle(terms, "segment");
    terms.labelStyle = hortis.elementStyle(terms, "label");
    var togo = [{
        position: 0,
        markup: hortis.renderSVGTemplate(that.options.markup.segment, terms)
    }, {
        position: 2,
        markup: hortis.renderSVGTemplate(that.options.markup.label, terms)
    }];
    if (terms.phyloPicUrl) {
        togo.push({
            position: 1,
            markup: hortis.renderSVGTemplate(that.options.markup.phyloPic, terms)
        });
    }
    return togo;
};

hortis.elementComparator = function (element1, element2) {
    return element1.position - element2.position;
};

hortis.render = function (that) {
    var markup = that.options.markup.segmentHeader;
    var elements = [];
    for (var i = 0; i < that.flatTree.length; ++i) {
        if (that.visMap[i] || that.oldVisMap && that.oldVisMap[i]) {
            elements = elements.concat(that.renderSegment(that.flatTree[i]));
        }
    }
    elements.sort(hortis.elementComparator);
    markup += fluid.getMembers(elements, "markup").join("");
    markup += that.options.markup.segmentFooter;
    var container = that.locate("svg");
    container.empty();
    hortis.renderSVGElement(markup, container);
};


hortis.depthComparator = function (rowa, rowb) {
    return rowa.depth - rowb.depth;
};

hortis.flattenTree = function (tree) {
    var flat = [];
    flat.push(tree);
    hortis.flattenTreeRecurse(tree, flat);
    flat.sort(hortis.depthComparator);
    flat.forEach(function (row, flatIndex) {
        row.flatIndex = flatIndex;
    });
    return flat;
};

hortis.indexTree = function (flatTree) {
    var index = {};
    flatTree.forEach(function (row) {
        index[row.id] = row;
    });
    return index;
};

hortis.flattenTreeRecurse = function (tree, toAppend) {
    tree.children.forEach(function (child) {
        child.parent = tree;
        toAppend.push(child);
        hortis.flattenTreeRecurse(child, toAppend);
    });
};

hortis.doLayout = function (flatTree) {
    fluid.each(flatTree, function (node) {
        if (node.depth === 0) {
            node.leftIndex = 0;
        }
        var thisLeft = node.leftIndex;
        node.children.forEach(function (child) {
            child.leftIndex = thisLeft;
            thisLeft += child.childCount;
        });
    });
};

hortis.computeMaxDepth = function (flatTree) {
    return flatTree[flatTree.length - 1].depth;
};

hortis.doInitialQuery = function (that) {
    var togo = that.flatTree[0];
    var storeQueryResult = function (result) {
        togo = result[0];
    };
    // These used to be different but are now the same since we no longer select taxon on hover. Should be able to axe "selectOnStartup" as disused
    var toSelect = that.options.queryOnStartup || that.options.selectOnStartup;
    if (toSelect) {
        hortis.queryAutocomplete(that.flatTree, toSelect, storeQueryResult);
    }
    return togo;
};

hortis.computeInitialScale = function (that) {
    var root = hortis.doInitialQuery(that);
    that.events.changeLayoutId.fire(root.id);
};
