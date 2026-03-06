async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("http://127.0.0.1:8000/upload/", {
        method: "POST",
        body: formData
    });

    const data = await response.json();

    const files = data.files;
    const structure = data.structure;

    // -----------------------------
    // Files Metadata Table
    // -----------------------------
    const fileTable = $('#resultTable').DataTable();
    fileTable.clear();

    files.forEach(item => {
        fileTable.row.add([
            item.file_id || "",
            item.mime_type || "",
            item.size || "",
            item.checksum || "",
            item.checksum_type || "",
            item.file_location || ""
        ]);
    });

    fileTable.draw();


    // -----------------------------
    // Structure Table
    // -----------------------------
    // -----------------------------
// Structure Table
// -----------------------------
const structTable = $('#structureTable').DataTable();
structTable.clear();

// create lookup map: FILEID -> file name
const fileLookup = {};
files.forEach(f => {
    fileLookup[f.file_id] = f.file_location;
});

structure.forEach(item => {

    const fileName = fileLookup[item.file_id] || item.file_id;

    structTable.row.add([
        item.order || "",
        item.division_id || "",
        fileName
    ]);
});

structTable.draw();



// -----------------------------
// Collection Summary
// -----------------------------

const totalFiles = files.length;

let filesWithChecksum = 0;
let algorithms = new Set();

files.forEach(f => {
    if (f.checksum) {
        filesWithChecksum++;
    }

    if (f.checksum_type) {
        algorithms.add(f.checksum_type);
    }
});

const missingHashes = totalFiles - filesWithChecksum;

document.getElementById("totalFiles").textContent = totalFiles;
document.getElementById("filesWithChecksum").textContent = filesWithChecksum;
document.getElementById("checksumAlgo").textContent = [...algorithms].join(", ") || "None";
document.getElementById("missingHashes").textContent = missingHashes;

// -----------------------------
// File Type Chart
// -----------------------------

const typeCounts = {};

files.forEach(f => {

    if (!f.mime_type) return;

    const type = f.mime_type.split("/")[1] || f.mime_type;

    if (!typeCounts[type]) {
        typeCounts[type] = 0;
    }

    typeCounts[type]++;
});

const labels = Object.keys(typeCounts);
const values = Object.values(typeCounts);

const ctx = document.getElementById('fileTypeChart');

new Chart(ctx, {
    type: 'pie',
    data: {
        labels: labels,
        datasets: [{
            data: values
        }]
    }
});

}




// Initialize both tables when page loads
$(document).ready(function() {
    $('#resultTable').DataTable();
    $('#structureTable').DataTable();
});