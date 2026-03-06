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

    const table = $('#resultTable').DataTable();
    table.clear();

    data.forEach(item => {
        table.row.add([
            item.file_id,
            item.mime_type,
            item.file_location
        ]);
    });

    table.draw();
}

$(document).ready(function() {
    $('#resultTable').DataTable();
});