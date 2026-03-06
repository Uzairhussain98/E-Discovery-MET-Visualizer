from lxml import etree


def parse_mets(file_content):
    tree = etree.XML(file_content)

    nsmap = tree.nsmap
    mets_ns = nsmap.get(None) or nsmap.get('mets')

    if not mets_ns:
        return {"files": [], "structure": []}

    ns = {
        "mets": mets_ns,
        "xlink": "http://www.w3.org/1999/xlink"
    }

    documents = []

    # ----------------------------
    # Build checksum lookup table
    # ----------------------------
    checksum_map = {}

    checksums = tree.xpath("//mets:amdSec//checksum", namespaces=ns)

    for cs in checksums:
        file_id = cs.get("FILEID")
        checksum_value = cs.text
        checksum_type = cs.get("TYPE")

        checksum_map[file_id] = {
            "checksum": checksum_value,
            "checksum_type": checksum_type
        }

    # ----------------------------
    # Parse file entries
    # ----------------------------
    for file in tree.xpath("//mets:file", namespaces=ns):

        file_id = file.get("ID")
        mime_type = file.get("MIMETYPE")
        size = file.get("SIZE")

        flocat = file.find("mets:FLocat", namespaces=ns)

        href = None
        if flocat is not None:
            href = flocat.get("{http://www.w3.org/1999/xlink}href")

        # get checksum info if exists
        checksum = None
        checksum_type = None

        if file_id in checksum_map:
            checksum = checksum_map[file_id]["checksum"]
            checksum_type = checksum_map[file_id]["checksum_type"]

        documents.append({
            "file_id": file_id,
            "mime_type": mime_type,
            "size": size,
            "checksum": checksum,
            "checksum_type": checksum_type,
            "file_location": href
        })

    # ----------------------------
    # Parse structMap (logical structure)
    # ----------------------------
    structure = []

    for div in tree.xpath("//mets:structMap[@TYPE='logical']//mets:div", namespaces=ns):

        div_id = div.get("ID")
        order = div.get("ORDER")
        label = div.get("LABEL")

        fptr = div.find("mets:fptr", namespaces=ns)

        file_id = None
        if fptr is not None:
            file_id = fptr.get("FILEID")

        if file_id:
            structure.append({
                "division_id": div_id,
                "order": order,
                "label": label,
                "file_id": file_id
            })

    return {
        "files": documents,
        "structure": structure
    }