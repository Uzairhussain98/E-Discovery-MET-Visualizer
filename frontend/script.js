let fileTypeChart;
let pendingFiles = [];
let parsedFileEntries = [];
let metadataMap;

async function uploadFile() {
    const statusEl = document.getElementById("uploadStatus");

    if (!pendingFiles.length) {
        statusEl.textContent = "Select at least one XML/METS file or folder.";
        return;
    }

    const xmlFiles = pendingFiles.filter(file => {
        const name = (file.webkitRelativePath || file.name || "").toLowerCase();
        return name.endsWith(".xml") || name.endsWith(".mets");
    });

    if (!xmlFiles.length) {
        statusEl.textContent = "No XML or METS files were found in your selection.";
        return;
    }

    statusEl.textContent = `Uploading ${pendingFiles.length} selected file(s) including ${xmlFiles.length} METS document(s)...`;

    const formData = new FormData();
    pendingFiles.forEach(file => {
        formData.append("files", file, file.webkitRelativePath || file.name);
    });

    let response;

    try {
        response = await fetch("http://127.0.0.1:8000/upload/", {
            method: "POST",
            body: formData
        });
    } catch (error) {
        statusEl.textContent = "Upload failed. Please check that the backend server is running.";
        return;
    }

    if (!response.ok) {
        statusEl.textContent = "Upload failed. Please try again.";
        return;
    }

    const data = await response.json();
    const documents = data.documents || [];
    const summary = data.summary || {};
    const files = documents.flatMap(document =>
        (document.files || []).map(item => ({
            ...item,
            source_file: document.source_file
        }))
    );
    const structure = documents.flatMap(document =>
        (document.structure || []).map(item => ({
            ...item,
            source_file: document.source_file
        }))
    );
    const structureTrees = documents.map(document => ({
        source_file: document.source_file,
        error: document.error,
        structure_tree: document.structure_tree || []
    }));

    parsedFileEntries = files;

    renderDocumentStatus(documents);
    renderProvenanceSection(documents);
    renderFilesTable(files);
    renderStructureTrees(files, structureTrees);
    renderStructureTable(files, structure);
    renderSummary(summary, files, structure);
    renderFileTypeChart(files);

    statusEl.textContent = `Loaded ${summary.parsed_files || 0} of ${summary.uploaded_files || xmlFiles.length} selected METS document(s).`;
}

function mergeSelectedFiles(fileList, replaceExisting = false) {
    const nextFiles = replaceExisting ? [] : [...pendingFiles];
    const seen = new Set(nextFiles.map(file => file.webkitRelativePath || file.name));

    Array.from(fileList || []).forEach(file => {
        const key = file.webkitRelativePath || file.name;
        if (!seen.has(key)) {
            nextFiles.push(file);
            seen.add(key);
        }
    });

    pendingFiles = nextFiles;
    renderSelectedFiles();
}

function renderSelectedFiles() {
    const summaryEl = document.getElementById("selectionSummary");
    const listEl = document.getElementById("selectedFilesList");

    if (!pendingFiles.length) {
        summaryEl.textContent = "No files selected.";
        listEl.innerHTML = "";
        return;
    }

    summaryEl.textContent = `${pendingFiles.length} file(s) selected. In the file picker, use Ctrl or Shift to select several files at once.`;
    listEl.innerHTML = pendingFiles
        .slice(0, 12)
        .map(file => `<li>${escapeHtml(file.webkitRelativePath || file.name)}</li>`)
        .join("");

    if (pendingFiles.length > 12) {
        listEl.innerHTML += `<li>...and ${pendingFiles.length - 12} more</li>`;
    }
}

function renderDocumentStatus(documents) {
    const statusList = document.getElementById("documentStatusList");

    if (!documents.length) {
        statusList.innerHTML = "<li>No upload results yet.</li>";
        return;
    }

    statusList.innerHTML = documents.map(document => {
        const fileCount = (document.files || []).length;
        const structureCount = (document.structure || []).length;
        const statusClass = document.error ? "status-error" : "status-success";
        const statusText = document.error
            ? `Failed: ${document.error}`
            : `Parsed ${fileCount} file entr${fileCount === 1 ? "y" : "ies"} and ${structureCount} structure entr${structureCount === 1 ? "y" : "ies"}.`;

        return `<li class="${statusClass}"><strong>${escapeHtml(document.source_file || "Unnamed file")}</strong><span>${escapeHtml(statusText)}</span></li>`;
    }).join("");
}

function renderProvenanceSection(documents) {
    const section = document.getElementById("provenanceSection");

    if (!documents.length) {
        section.innerHTML = "<p class=\"metadata-muted\">Upload a METS document to inspect provenance details.</p>";
        return;
    }

    const cards = documents.map(document => {
        if (document.error) {
            return `
                <article class="provenance-card">
                    <div class="provenance-card-header">
                        <h3>${escapeHtml(document.source_file || "Unnamed file")}</h3>
                        <span class="provenance-badge provenance-badge-missing">Parse failed</span>
                    </div>
                    <p class="metadata-muted">${escapeHtml(document.error)}</p>
                </article>
            `;
        }

        const provenance = document.provenance || {};
        const header = provenance.header || {};
        const agents = provenance.agents || [];
        const events = provenance.explicit_events || [];
        const digiprovSections = provenance.digiprov_sections || [];
        const hasExplicitChain = !!provenance.has_explicit_chain_of_custody;

        const headerCards = [
            createMetadataCard("Created", header.created_date || "Not provided"),
            createMetadataCard("Last Modified", header.last_modified_date || "Not provided"),
            createMetadataCard("Record Status", header.record_status || "Not provided"),
            createMetadataCard("digiprovMD Sections", String(digiprovSections.length))
        ].join("");

        const agentList = agents.length
            ? `<div class="provenance-list">${agents.map(agent => `
                <div class="metadata-item">
                    <strong>${escapeHtml(agent.name || "Unnamed agent")}</strong>
                    <span>${escapeHtml(formatAgent(agent))}</span>
                </div>
            `).join("")}</div>`
            : `<p class="metadata-muted">No header agents were provided.</p>`;

        const eventList = events.length
            ? `<div class="provenance-list">${events.map(event => `
                <div class="metadata-item">
                    <strong>${escapeHtml(event.type || "Unlabeled event")}</strong>
                    <span>${escapeHtml(formatEvent(event))}</span>
                </div>
            `).join("")}</div>`
            : `<p class="metadata-muted">No explicit custody or preservation events were found in this METS document.</p>`;

        const digiprovSummary = digiprovSections.length
            ? `<div class="provenance-list">${digiprovSections.map(sectionItem => `
                <div class="metadata-item">
                    <strong>${escapeHtml(sectionItem.id || "digiprovMD")}</strong>
                    <span>${escapeHtml(formatDigiprovSummary(sectionItem.summary || []))}</span>
                </div>
            `).join("")}</div>`
            : `<p class="metadata-muted">No digiprovMD sections were found.</p>`;

        return `
            <article class="provenance-card">
                <div class="provenance-card-header">
                    <h3>${escapeHtml(document.source_file || "Unnamed file")}</h3>
                    <span class="provenance-badge ${hasExplicitChain ? "provenance-badge-present" : "provenance-badge-missing"}">
                        ${hasExplicitChain ? "Explicit custody events found" : "No explicit custody trail"}
                    </span>
                </div>
                <p class="metadata-muted">${escapeHtml(provenance.note || "No provenance summary available.")}</p>
                <div class="metadata-grid">${headerCards}</div>
                <h4>Header Agents</h4>
                ${agentList}
                <h4>Custody / Preservation Events</h4>
                ${eventList}
                <h4>digiprovMD Summary</h4>
                ${digiprovSummary}
            </article>
        `;
    });

    section.innerHTML = cards.join("");
}

function renderFilesTable(files) {
    const fileTable = $("#resultTable").DataTable();
    fileTable.clear();

    files.forEach(item => {
        const fileKey = buildFileKey(item);
        fileTable.row.add([
            item.source_file || "",
            item.file_id || "",
            item.mime_type || "",
            item.size || "",
            item.checksum || "",
            item.checksum_type || "",
            item.file_location || "",
            `<button type="button" class="metadata-trigger" data-file-key="${escapeHtml(fileKey)}">View Metadata</button>`
        ]);
    });

    fileTable.draw();
}

function renderStructureTable(files, structure) {
    const tableEl = $("#structureTable");

    if ($.fn.DataTable.isDataTable(tableEl)) {
        tableEl.DataTable().clear().destroy();
    }

    const structTable = tableEl.DataTable({
        columns: [
            { title: "Source METS" },
            { title: "Map Type" },
            { title: "Order" },
            { title: "Division ID" },
            { title: "File Name" }
        ]
    });

    const fileLookup = {};
    files.forEach(file => {
        fileLookup[`${file.source_file}::${file.file_id}`] = file.file_location;
    });

    structure.forEach(item => {
        const fileName = fileLookup[`${item.source_file}::${item.file_id}`] || item.file_id;

        structTable.row.add([
            item.source_file || "",
            item.structmap_type || item.structmap_id || "",
            item.order || "",
            item.division_id || "",
            fileName || ""
        ]);
    });

    structTable.draw();
}

function renderStructureTrees(files, documents) {
    const section = document.getElementById("structureTreeSection");

    if (!documents.length) {
        section.innerHTML = "<p class=\"metadata-muted\">Upload a METS document to view its hierarchical structMap tree.</p>";
        return;
    }

    const fileLookup = {};
    files.forEach(file => {
        fileLookup[`${file.source_file}::${file.file_id}`] = file.file_location || file.file_id || "Linked file";
    });

    section.innerHTML = documents.map(document => {
        if (document.error) {
            return `
                <article class="structure-tree-card">
                    <div class="structure-tree-header">
                        <div>
                            <h3>${escapeHtml(document.source_file || "Unnamed file")}</h3>
                            <p class="metadata-muted">Tree unavailable because this METS file failed to parse.</p>
                        </div>
                    </div>
                </article>
            `;
        }

        const maps = document.structure_tree || [];
        const mapMarkup = maps.length
            ? maps.map((structMap, index) => renderStructMapCard(structMap, document.source_file, fileLookup, index === 0)).join("")
            : `<p class="metadata-muted">No structMap hierarchy was found in this METS document.</p>`;

        return `
            <article class="structure-tree-card">
                <div class="structure-tree-header">
                    <div>
                        <h3>${escapeHtml(document.source_file || "Unnamed file")}</h3>
                        <p class="metadata-muted">Expandable hierarchy extracted from METS structMap.</p>
                    </div>
                </div>
                <div class="structure-tree-maps">${mapMarkup}</div>
            </article>
        `;
    }).join("");
}

function renderStructMapCard(structMap, sourceFile, fileLookup, expanded = false) {
    const structMapLabel = structMap.structmap_type
        ? `${structMap.structmap_type} structMap`
        : (structMap.structmap_id || "structMap");
    const roots = structMap.roots || [];

    return `
        <section class="structmap-panel ${expanded ? "is-open" : ""}">
            <button type="button" class="structmap-toggle" aria-expanded="${expanded ? "true" : "false"}">
                <span class="structmap-toggle-copy">
                    <strong>${escapeHtml(structMapLabel)}</strong>
                    <span>${escapeHtml(structMap.structmap_id || "No ID provided")} | ${roots.length} root node${roots.length === 1 ? "" : "s"}</span>
                </span>
                <span class="structmap-chevron" aria-hidden="true"></span>
            </button>
            <div class="structmap-body">
                ${roots.length ? `<div class="tree-root">${roots.map(root => renderTreeNode(root, sourceFile, fileLookup)).join("")}</div>` : `<p class="metadata-muted">This structMap has no divisions.</p>`}
            </div>
        </section>
    `;
}

function renderTreeNode(node, sourceFile, fileLookup) {
    const childNodes = node.children || [];
    const linkedFiles = node.file_ids || [];
    const hasChildren = childNodes.length > 0 || linkedFiles.length > 0;
    const title = node.label || node.type || node.division_id || "Division";
    const meta = [
        node.type ? `Type: ${node.type}` : null,
        node.order ? `Order: ${node.order}` : null,
        node.division_id ? `ID: ${node.division_id}` : null
    ].filter(Boolean).join(" | ");

    const branchContent = [
        childNodes.map(child => renderTreeNode(child, sourceFile, fileLookup)).join(""),
        linkedFiles.map(fileId => renderLinkedFileNode(sourceFile, fileId, fileLookup)).join("")
    ].filter(Boolean).join("");

    return `
        <div class="tree-node ${hasChildren ? "tree-node-branch is-open" : "tree-node-leaf"}">
            <div class="tree-node-row ${hasChildren ? "tree-node-toggle" : ""}" ${hasChildren ? 'role="button" tabindex="0" aria-expanded="true"' : ""}>
                ${hasChildren ? '<span class="tree-node-caret" aria-hidden="true"></span>' : '<span class="tree-node-dot" aria-hidden="true"></span>'}
                <div class="tree-node-copy">
                    <strong>${escapeHtml(title)}</strong>
                    <span>${escapeHtml(meta || "No extra division metadata")}</span>
                </div>
            </div>
            ${hasChildren ? `<div class="tree-node-children">${branchContent}</div>` : ""}
        </div>
    `;
}

function renderLinkedFileNode(sourceFile, fileId, fileLookup) {
    const label = fileLookup[`${sourceFile}::${fileId}`] || fileId || "Linked file";

    return `
        <div class="tree-node tree-file-leaf">
            <div class="tree-node-row">
                <span class="tree-node-dot tree-node-dot-file" aria-hidden="true"></span>
                <div class="tree-node-copy">
                    <strong>${escapeHtml(label)}</strong>
                    <span>${escapeHtml(`FILEID: ${fileId || "Unknown"}`)}</span>
                </div>
            </div>
        </div>
    `;
}

function renderSummary(summary, files, structure) {
    const totalFiles = files.length;
    let filesWithChecksum = 0;
    const algorithms = new Set();

    files.forEach(file => {
        if (file.checksum) {
            filesWithChecksum++;
        }

        if (file.checksum_type) {
            algorithms.add(file.checksum_type);
        }
    });

    document.getElementById("totalUploads").textContent = summary.uploaded_files || 0;
    document.getElementById("parsedUploads").textContent = summary.parsed_files || 0;
    document.getElementById("failedUploads").textContent = summary.failed_files || 0;
    document.getElementById("totalFiles").textContent = totalFiles;
    document.getElementById("filesWithChecksum").textContent = filesWithChecksum;
    document.getElementById("checksumAlgo").textContent = [...algorithms].join(", ") || "None";
    document.getElementById("missingHashes").textContent = totalFiles - filesWithChecksum;
    document.getElementById("totalStructureEntries").textContent = structure.length;
}

function renderFileTypeChart(files) {
    const typeCounts = {};

    files.forEach(file => {
        if (!file.mime_type) {
            return;
        }

        const type = file.mime_type.split("/")[1] || file.mime_type;
        typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const labels = Object.keys(typeCounts);
    const values = Object.values(typeCounts);
    const ctx = document.getElementById("fileTypeChart");

    if (fileTypeChart) {
        fileTypeChart.destroy();
    }

    fileTypeChart = new Chart(ctx, {
        type: "pie",
        data: {
            labels,
            datasets: [{
                data: values
            }]
        },
        options: {
            plugins: {
                legend: {
                    display: labels.length > 0
                }
            }
        }
    });
}

function buildFileKey(item) {
    return `${item.source_file || ""}::${item.file_id || ""}`;
}

function openMetadataModal(fileEntry) {
    const modal = document.getElementById("metadataModal");
    const body = document.getElementById("metadataModalBody");
    const mapSection = document.getElementById("metadataMapSection");
    const imageMetadata = fileEntry.image_metadata;

    const blocks = [
        createMetadataCard("Source METS", fileEntry.source_file),
        createMetadataCard("File ID", fileEntry.file_id),
        createMetadataCard("File Location", fileEntry.file_location),
        createMetadataCard("MIME Type", fileEntry.mime_type),
        createMetadataCard("Size", fileEntry.size || "Not provided"),
        createMetadataCard("Checksum", fileEntry.checksum || "Not provided"),
        createMetadataCard("Checksum Type", fileEntry.checksum_type || "Not provided")
    ];

    if (!imageMetadata) {
        blocks.push(createMetadataNote("No image file was uploaded for this METS reference, so EXIF metadata is unavailable."));
    } else if (!imageMetadata.available) {
        blocks.push(createMetadataNote(imageMetadata.error || "Image metadata could not be read."));
    } else {
        blocks.push(`
            <div class="metadata-grid">
                ${createMetadataCard("Image Format", imageMetadata.format || "Unknown")}
                ${createMetadataCard("Dimensions", formatDimensions(imageMetadata))}
                ${createMetadataCard("Camera Make", imageMetadata.camera_make || "Not available")}
                ${createMetadataCard("Camera Model", imageMetadata.camera_model || "Not available")}
                ${createMetadataCard("Date Taken", imageMetadata.date_taken || "Not available")}
                ${createMetadataCard("GPS Coordinates", formatGps(imageMetadata))}
            </div>
        `);
    }

    body.innerHTML = blocks.join("");

    const hasGps = imageMetadata && imageMetadata.available && imageMetadata.has_gps;
    mapSection.style.display = hasGps ? "block" : "none";

    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");

    if (hasGps) {
        renderMetadataMap(imageMetadata.gps_latitude, imageMetadata.gps_longitude, fileEntry.file_location || fileEntry.file_id);
    } else if (metadataMap) {
        metadataMap.remove();
        metadataMap = null;
    }
}

function closeMetadataModal() {
    const modal = document.getElementById("metadataModal");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");

    if (metadataMap) {
        metadataMap.remove();
        metadataMap = null;
    }
}

function renderMetadataMap(latitude, longitude, label) {
    const mapContainer = document.getElementById("metadataMap");

    if (typeof L === "undefined") {
        mapContainer.innerHTML = "<p class=\"metadata-muted\">Map library failed to load, but GPS coordinates are available above.</p>";
        return;
    }

    mapContainer.innerHTML = "";

    if (metadataMap) {
        metadataMap.remove();
    }

    metadataMap = L.map(mapContainer).setView([latitude, longitude], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(metadataMap);

    L.marker([latitude, longitude]).addTo(metadataMap).bindPopup(escapeHtml(label || "Image location")).openPopup();

    setTimeout(() => {
        metadataMap.invalidateSize();
    }, 0);
}

function createMetadataCard(label, value) {
    return `<div class="metadata-item"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value || "Not available")}</span></div>`;
}

function createMetadataNote(message) {
    return `<p class="metadata-muted">${escapeHtml(message)}</p>`;
}

function formatDimensions(imageMetadata) {
    if (!imageMetadata.width || !imageMetadata.height) {
        return "Not available";
    }

    return `${imageMetadata.width} x ${imageMetadata.height}`;
}

function formatGps(imageMetadata) {
    if (!imageMetadata.has_gps) {
        return "Not available";
    }

    return `${imageMetadata.gps_latitude}, ${imageMetadata.gps_longitude}`;
}

function formatAgent(agent) {
    const parts = [agent.role, agent.type, agent.other_type].filter(Boolean);
    return parts.length ? parts.join(" | ") : "No agent role/type provided";
}

function formatEvent(event) {
    const parts = [event.date, event.detail].filter(Boolean);
    return parts.length ? parts.join(" | ") : "No event details provided";
}

function formatDigiprovSummary(summary) {
    if (!summary.length) {
        return "No structured digiprovMD details were extracted";
    }

    return summary
        .map(item => `${item.label}: ${item.value}`)
        .join(" | ");
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

$(document).ready(function() {
    $("#resultTable").DataTable({
        columns: [
            { title: "Source METS" },
            { title: "File ID" },
            { title: "MIME Type" },
            { title: "Size" },
            { title: "Checksum" },
            { title: "Checksum Type" },
            { title: "File Location" },
            { title: "Metadata", orderable: false, searchable: false }
        ]
    });

    $("#structureTable").DataTable({
        columns: [
            { title: "Source METS" },
            { title: "Map Type" },
            { title: "Order" },
            { title: "Division ID" },
            { title: "File Name" }
        ]
    });

    document.getElementById("fileInput").addEventListener("change", event => {
        mergeSelectedFiles(event.target.files, false);
        event.target.value = "";
    });

    document.getElementById("folderInput").addEventListener("change", event => {
        mergeSelectedFiles(event.target.files, false);
        event.target.value = "";
    });

    $("#resultTable").on("click", ".metadata-trigger", function(event) {
        event.preventDefault();
        event.stopPropagation();

        const fileKey = this.dataset.fileKey || "";
        const fileEntry = parsedFileEntries.find(item => buildFileKey(item) === fileKey);

        if (fileEntry) {
            openMetadataModal(fileEntry);
        }
    });

    document.getElementById("closeMetadataModal").addEventListener("click", closeMetadataModal);
    document.getElementById("metadataModal").addEventListener("click", event => {
        if (event.target.dataset.closeModal === "true") {
            closeMetadataModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeMetadataModal();
        }
    });

    document.getElementById("structureTreeSection").addEventListener("click", event => {
        const mapToggle = event.target.closest(".structmap-toggle");
        if (mapToggle) {
            const panel = mapToggle.closest(".structmap-panel");
            const isOpen = panel.classList.toggle("is-open");
            mapToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
            return;
        }

        const nodeToggle = event.target.closest(".tree-node-toggle");
        if (nodeToggle) {
            toggleTreeBranch(nodeToggle);
        }
    });

    document.getElementById("structureTreeSection").addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }

        const nodeToggle = event.target.closest(".tree-node-toggle");
        if (!nodeToggle) {
            return;
        }

        event.preventDefault();
        toggleTreeBranch(nodeToggle);
    });
});

function toggleTreeBranch(nodeToggle) {
    const branch = nodeToggle.closest(".tree-node-branch");
    if (!branch) {
        return;
    }

    const isOpen = branch.classList.toggle("is-open");
    nodeToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
}
