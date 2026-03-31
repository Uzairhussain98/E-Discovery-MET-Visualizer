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

    parsedFileEntries = files;

    renderDocumentStatus(documents);
    renderFilesTable(files);
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
    const structTable = $("#structureTable").DataTable();
    structTable.clear();

    const fileLookup = {};
    files.forEach(file => {
        fileLookup[`${file.source_file}::${file.file_id}`] = file.file_location;
    });

    structure.forEach(item => {
        const fileName = fileLookup[`${item.source_file}::${item.file_id}`] || item.file_id;

        structTable.row.add([
            item.source_file || "",
            item.order || "",
            item.division_id || "",
            fileName || ""
        ]);
    });

    structTable.draw();
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

    $("#structureTable").DataTable();

    document.getElementById("fileInput").addEventListener("change", event => {
        mergeSelectedFiles(event.target.files, true);
    });

    document.getElementById("folderInput").addEventListener("change", event => {
        mergeSelectedFiles(event.target.files, false);
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
});
