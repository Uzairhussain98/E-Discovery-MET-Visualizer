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

    for file in files:
        content = await file.read()
        parsed_documents.append(parse_mets_document(file.filename, content))

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
