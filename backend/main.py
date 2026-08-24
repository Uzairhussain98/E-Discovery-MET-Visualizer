from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

try:
    from parser import parse_mets_document
except ModuleNotFoundError:
    from backend.parser import parse_mets_document

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload/")
async def upload_mets(files: list[UploadFile] = File(...)):
    parsed_documents = []
    uploaded_binary_files = {}
    mets_files = []

    for file in files:
        content = await file.read()
        file_name = file.filename or ""
        lower_name = file_name.lower()

        if lower_name.endswith(".xml") or lower_name.endswith(".mets"):
            mets_files.append((file_name, content))
        else:
            uploaded_binary_files[file_name] = content

    for file_name, content in mets_files:
        parsed_documents.append(
            parse_mets_document(file_name, content, uploaded_binary_files=uploaded_binary_files)
        )

    total_file_entries = sum(len(document["files"]) for document in parsed_documents)
    total_struct_entries = sum(len(document["structure"]) for document in parsed_documents)
    failed_files = [document for document in parsed_documents if document["error"]]

    return {
        "documents": parsed_documents,
        "summary": {
            "uploaded_files": len(parsed_documents),
            "parsed_files": len(parsed_documents) - len(failed_files),
            "failed_files": len(failed_files),
            "total_file_entries": total_file_entries,
            "total_struct_entries": total_struct_entries
        }
    }
