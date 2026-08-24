import io
import posixpath

from lxml import etree

try:
    from PIL import ExifTags, Image
except ModuleNotFoundError:
    ExifTags = None
    Image = None


def normalize_upload_path(path):
    return path.replace("\\", "/").lstrip("./")


def build_uploaded_file_lookup(uploaded_files):
    files_by_path = {}
    files_by_name = {}

    for path, content in (uploaded_files or {}).items():
        normalized_path = normalize_upload_path(path)
        files_by_path[normalized_path] = content
        base_name = posixpath.basename(normalized_path)
        files_by_name.setdefault(base_name, []).append(content)

    return files_by_path, files_by_name


def resolve_uploaded_reference(source_file, href, uploaded_files):
    if not href or not uploaded_files:
        return None

    files_by_path, files_by_name = uploaded_files
    normalized_href = normalize_upload_path(href)

    if normalized_href in files_by_path:
        return files_by_path[normalized_href]

    source_dir = posixpath.dirname(normalize_upload_path(source_file))
    if source_dir:
        relative_path = normalize_upload_path(posixpath.join(source_dir, normalized_href))
        if relative_path in files_by_path:
            return files_by_path[relative_path]

    matches = files_by_name.get(posixpath.basename(normalized_href), [])
    if len(matches) == 1:
        return matches[0]

    return None


def exif_value_to_string(value):
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8", errors="ignore").strip("\x00")
        except Exception:
            return repr(value)
    return value


def convert_gps_coordinate(values, ref):
    if not values or len(values) != 3:
        return None

    def to_float(component):
        if hasattr(component, "numerator") and hasattr(component, "denominator"):
            if component.denominator == 0:
                return 0
            return component.numerator / component.denominator

        if isinstance(component, tuple) and len(component) == 2 and component[1]:
            return component[0] / component[1]

        return float(component)

    degrees = to_float(values[0])
    minutes = to_float(values[1])
    seconds = to_float(values[2])
    coordinate = degrees + (minutes / 60) + (seconds / 3600)

    if ref in ("S", "W"):
        coordinate *= -1

    return round(coordinate, 6)


def extract_image_metadata(file_content):
    if Image is None or ExifTags is None:
        return {
            "available": False,
            "error": "Pillow is not installed on the backend."
        }

    try:
        with Image.open(io.BytesIO(file_content)) as image:
            metadata = {
                "available": True,
                "format": image.format,
                "width": image.width,
                "height": image.height,
                "camera_make": None,
                "camera_model": None,
                "date_taken": None,
                "gps_latitude": None,
                "gps_longitude": None
            }

            raw_exif = image.getexif()
            if not raw_exif:
                return metadata

            tag_names = ExifTags.TAGS
            metadata["camera_make"] = exif_value_to_string(raw_exif.get(271))
            metadata["camera_model"] = exif_value_to_string(raw_exif.get(272))
            metadata["date_taken"] = exif_value_to_string(raw_exif.get(36867) or raw_exif.get(306))

            gps_info = {}
            gps_tag_id = next((tag_id for tag_id, name in tag_names.items() if name == "GPSInfo"), None)

            if gps_tag_id is not None:
                try:
                    raw_gps_info = raw_exif.get_ifd(gps_tag_id)
                except Exception:
                    raw_gps_info = None

                if isinstance(raw_gps_info, dict):
                    for key, value in raw_gps_info.items():
                        gps_info[ExifTags.GPSTAGS.get(key, key)] = value

            latitude = convert_gps_coordinate(gps_info.get("GPSLatitude"), gps_info.get("GPSLatitudeRef"))
            longitude = convert_gps_coordinate(gps_info.get("GPSLongitude"), gps_info.get("GPSLongitudeRef"))

            metadata["gps_latitude"] = latitude
            metadata["gps_longitude"] = longitude
            metadata["has_gps"] = latitude is not None and longitude is not None

            return metadata
    except Exception as exc:
        return {
            "available": False,
            "error": f"Unable to read image metadata: {exc}"
        }


def get_trimmed_text(node):
    if node is None:
        return None

    text = " ".join(part.strip() for part in node.itertext() if part and part.strip())
    return text or None


def get_local_name(node):
    if node is None or not hasattr(node, "tag") or not isinstance(node.tag, str):
        return None

    if "}" in node.tag:
        return node.tag.split("}", 1)[1]

    return node.tag


def summarize_xml_node(node, limit=8):
    if node is None:
        return []

    summary = []

    for child in node:
        if not hasattr(child, "tag") or not isinstance(child.tag, str):
            continue

        label = get_local_name(child) or "value"
        value = get_trimmed_text(child)

        if value:
            summary.append({
                "label": label,
                "value": value
            })

        if len(summary) >= limit:
            break

    if not summary:
        value = get_trimmed_text(node)
        if value:
            summary.append({
                "label": get_local_name(node) or "value",
                "value": value
            })

    return summary[:limit]


def parse_structmap_div(node, depth=0):
    div_id = node.get("ID")
    order = node.get("ORDER")
    label = node.get("LABEL")
    div_type = node.get("TYPE")

    fptrs = []
    for fptr in node.findall("mets:fptr", namespaces=node.nsmap):
        file_id = fptr.get("FILEID")
        if file_id:
            fptrs.append(file_id)

    children = []
    for child_div in node.findall("mets:div", namespaces=node.nsmap):
        children.append(parse_structmap_div(child_div, depth=depth + 1))

    return {
        "division_id": div_id,
        "order": order,
        "label": label,
        "type": div_type,
        "depth": depth,
        "file_ids": fptrs,
        "children": children
    }


def flatten_structmap_tree(tree_node, structmap_id=None, structmap_type=None):
    flat_entries = []

    for file_id in tree_node.get("file_ids", []):
        flat_entries.append({
            "division_id": tree_node.get("division_id"),
            "order": tree_node.get("order"),
            "label": tree_node.get("label"),
            "file_id": file_id,
            "structmap_id": structmap_id,
            "structmap_type": structmap_type
        })

    for child in tree_node.get("children", []):
        flat_entries.extend(
            flatten_structmap_tree(child, structmap_id=structmap_id, structmap_type=structmap_type)
        )

    return flat_entries


def extract_provenance(tree, ns):
    mets_header = tree.find("mets:metsHdr", namespaces=ns)
    agents = []

    if mets_header is not None:
        for agent in mets_header.findall("mets:agent", namespaces=ns):
            agents.append({
                "name": get_trimmed_text(agent.find("mets:name", namespaces=ns)) or "Unnamed agent",
                "role": agent.get("ROLE"),
                "type": agent.get("TYPE"),
                "other_type": agent.get("OTHERTYPE")
            })

    digiprov_sections = []
    explicit_events = []

    for digiprov in tree.xpath("//mets:digiprovMD", namespaces=ns):
        digiprov_id = digiprov.get("ID")
        xml_data = digiprov.find(".//mets:xmlData", namespaces=ns)
        section_summary = summarize_xml_node(xml_data if xml_data is not None else digiprov)

        digiprov_sections.append({
            "id": digiprov_id,
            "summary": section_summary
        })

        for event in digiprov.xpath(".//*[local-name()='event']"):
            def first_descendant_text(local_name):
                node = event.xpath(f".//*[local-name()='{local_name}']")
                return get_trimmed_text(node[0]) if node else None

            explicit_events.append({
                "identifier": first_descendant_text("eventIdentifierValue"),
                "type": first_descendant_text("eventType"),
                "date": first_descendant_text("eventDateTime"),
                "detail": first_descendant_text("eventDetail"),
                "agent_type": first_descendant_text("linkingAgentIdentifierType"),
                "agent": first_descendant_text("linkingAgentIdentifierValue")
            })

        explicit_events = [
            event for event in explicit_events
            if any(event.get(key) for key in ("identifier", "type", "date", "detail", "agent"))
        ]

    return {
        "header": {
            "created_date": mets_header.get("CREATEDATE") if mets_header is not None else None,
            "last_modified_date": mets_header.get("LASTMODDATE") if mets_header is not None else None,
            "record_status": mets_header.get("RECORDSTATUS") if mets_header is not None else None
        },
        "agents": agents,
        "digiprov_sections": digiprov_sections,
        "explicit_events": explicit_events,
        "has_explicit_chain_of_custody": len(explicit_events) > 0,
        "note": (
            "Explicit custody-style events were found in digiprovMD."
            if explicit_events
            else "No explicit chain-of-custody events were found. METS often includes creator/provenance clues, but many organizations do not record a full custody trail in the METS itself."
        )
    }


def parse_mets(file_content):
    tree = etree.XML(file_content)

    nsmap = tree.nsmap
    mets_ns = nsmap.get(None)

    if not mets_ns:
        for prefix, namespace in nsmap.items():
            if namespace == "http://www.loc.gov/METS/":
                mets_ns = namespace
                break

    if not mets_ns:
        return {"files": [], "structure": []}

    ns = {
        "mets": mets_ns,
        "xlink": "http://www.w3.org/1999/xlink"
    }

    documents = []
    provenance = extract_provenance(tree, ns)

    # ----------------------------
    # Build checksum lookup table
    # ----------------------------
    checksum_map = {}

    checksums = tree.xpath("//mets:amdSec//*[local-name()='checksum']", namespaces=ns)

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
    # Parse structMap hierarchy
    # ----------------------------
    structure = []
    structure_tree = []

    for struct_map in tree.xpath("//mets:structMap", namespaces=ns):
        root_divs = struct_map.findall("mets:div", namespaces=ns)
        root_nodes = [parse_structmap_div(root_div) for root_div in root_divs]
        structmap_id = struct_map.get("ID")
        structmap_type = struct_map.get("TYPE")

        structure_tree.append({
            "structmap_id": structmap_id,
            "structmap_type": structmap_type,
            "roots": root_nodes
        })

        for root_node in root_nodes:
            structure.extend(
                flatten_structmap_tree(
                    root_node,
                    structmap_id=structmap_id,
                    structmap_type=structmap_type
                )
            )

    return {
        "files": documents,
        "structure": structure,
        "structure_tree": structure_tree,
        "provenance": provenance
    }


def parse_mets_document(file_name, file_content, uploaded_binary_files=None):
    try:
        parsed = parse_mets(file_content)
        parsed["source_file"] = file_name
        uploaded_lookup = build_uploaded_file_lookup(uploaded_binary_files)

        for item in parsed["files"]:
            related_file = resolve_uploaded_reference(file_name, item.get("file_location"), uploaded_lookup)
            item["image_metadata"] = extract_image_metadata(related_file) if related_file else None

        parsed["error"] = None
        return parsed
    except etree.XMLSyntaxError as exc:
        return {
            "source_file": file_name,
            "files": [],
            "structure": [],
            "structure_tree": [],
            "provenance": None,
            "error": f"Invalid XML: {exc}"
        }
    except Exception as exc:
        return {
            "source_file": file_name,
            "files": [],
            "structure": [],
            "structure_tree": [],
            "provenance": None,
            "error": f"Unable to parse METS: {exc}"
        }
