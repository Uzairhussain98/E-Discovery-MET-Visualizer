# from lxml import etree

# def parse_mets(file_content):
#     tree = etree.XML(file_content)

#     ns = {
#         "mets": "http://www.loc.gov/METS/"
#     }

#     documents = []

#     # Extract file metadata
#     for file in tree.xpath("//mets:file", namespaces=ns):
#         file_id = file.get("ID")
#         mime_type = file.get("MIMETYPE")

#         flocat = file.find("mets:FLocat", namespaces=ns)
#         href = flocat.get("{http://www.w3.org/1999/xlink}href") if flocat is not None else None

#         documents.append({
#             "file_id": file_id,
#             "mime_type": mime_type,
#             "file_location": href
#         })

#     return documents


from lxml import etree

def parse_mets(file_content):
    tree = etree.XML(file_content)

    # Detect namespace dynamically
    nsmap = tree.nsmap
    mets_ns = nsmap.get(None) or nsmap.get('mets')

    if not mets_ns:
        return []

    ns = {"mets": mets_ns}

    documents = []

    for file in tree.xpath("//mets:file", namespaces=ns):
        file_id = file.get("ID")
        mime_type = file.get("MIMETYPE")

        flocat = file.find("mets:FLocat", namespaces=ns)
        href = None
        if flocat is not None:
            href = flocat.get("{http://www.w3.org/1999/xlink}href")

        documents.append({
            "file_id": file_id,
            "mime_type": mime_type,
            "file_location": href
        })

    return documents