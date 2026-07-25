"""
PDF Analysis Engine — Validates MIS PDFs against MISTemplate bounding boxes
with tolerance for day-to-day layout drift, then aggregates into 5 categories
(Sections, Comm, Table, Chart, Image) for the dashboard.
"""
import re

STRICT_TOLERANCE = 5
RELAXED_TOLERANCE = 25

TYPE_TO_CATEGORY = {
    'name': 'Sections',
    'date': 'Sections',
    'text': 'Sections',
    'heading': 'Sections',
    'commentary': 'Comm',
    'news': 'News',
    'table': 'Table',
    'chart': 'Chart',
    'image': 'Image',
}

CATEGORY_ORDER = ['Sections', 'Comm', 'News', 'Table', 'Chart', 'Image']


def analyze_pdf(filepath, report_type='', template_config=None):
    """Analyze a PDF report and return structured analysis with template validation.

    The route layer is responsible for fetching the MISTemplate and passing
    template_config (a list of bounding-box dicts) here — keeps this module
    free of Flask app-context concerns.
    """
    try:
        import pdfplumber
    except ImportError:
        return {'error': 'pdfplumber not installed', 'qualityScore': 0, 'summary': 'PDF parser not available'}

    result = {
        'reportType': report_type,
        'validationResults': {},   # Box label -> 'pass' | 'partial' | 'fail'
        'isTemplateBased': False,
        'sectionsFound': [],
        'sectionsMissing': [],
        'tablesCount': 0,
        'chartsCount': 0,
        'commentaryStatus': '',
        'qualityScore': 0,
        'warnings': [],
        'summary': '',
        'pageCount': 0,
        'categoryStatus': {},      # 'Sections': 'green' | 'red' | 'absent'
        'categoryDetail': {},      # 'Sections': {passed, partial, total, failedLabels}
    }

    try:
        if template_config:
            result['isTemplateBased'] = True

        with pdfplumber.open(filepath) as pdf:
            result['pageCount'] = len(pdf.pages)
            # Capture the first-page text once, used later for the report-type
            # vs extracted-name mismatch check.
            try:
                first_page_text = (pdf.pages[0].extract_text() or '') if pdf.pages else ''
            except Exception:
                first_page_text = ''

            if template_config:
                # Expose the template boxes in the result so the frontend can
                # group per-element status under section headings.
                result['templateBoxes'] = [
                    {
                        'label': b.get('label', ''),
                        'type': b.get('type', 'text'),
                        'page': int(b.get('page', 1)),
                        'x0': float(b.get('x0', 0)),
                        'y0': float(b.get('y0', 0)),
                        'x1': float(b.get('x1', 0)),
                        'y1': float(b.get('y1', 0)),
                        'text': b.get('text', ''),
                        'heading': b.get('heading', ''),
                    }
                    for b in template_config
                ]
                _run_template_validation(pdf, template_config, result)
            else:
                _run_legacy_extraction(pdf, result, report_type)

        # Mismatch detection — compare the chosen report type against what's
        # actually in the PDF's first page + extracted report name. If none of
        # the report-type keywords appear anywhere, the user almost certainly
        # uploaded the wrong file against this template.
        result['mismatch'] = _detect_report_type_mismatch(
            report_type,
            (result.get('extractedFields') or {}).get('name', ''),
            first_page_text,
        )

    except Exception as e:
        result['warnings'].append(f'Parse error: {str(e)}')
        result['summary'] = f'Error analyzing PDF: {str(e)}'

    return result


_STOP_WORDS_REPORT_NAME = {
    'daily', 'weekly', 'monthly', 'update', 'updates', 'report', 'reports',
    'digest', 'wire', 'and', 'the', 'of', 'for', 'in', 'on', 'final',
    'draft', 'pdf',
}


def _significant_tokens(s):
    """Lowercase, strip punctuation/numbers/extension, drop common filler words."""
    if not s:
        return []
    t = s.lower()
    t = re.sub(r'\.[a-z0-9]+$', '', t)
    t = re.sub(r'[_\-(),.\/\\:]+', ' ', t)
    t = re.sub(r'\b\d+\b', ' ', t)
    return [w for w in t.split() if len(w) >= 3 and w not in _STOP_WORDS_REPORT_NAME]


def pdf_precheck(filepath, report_type):
    """Lightweight pre-validation: open PDF, read page 1 only, extract the
    report name + date, and decide whether the file matches the chosen
    report_type before the slow full analysis runs.

    Returns a dict:
        {
          ok: bool,
          extractedName: str,
          extractedDate: str,
          nameMatch: bool,            # name overlaps with report_type tokens
          dateFound: bool,            # any date pattern present in page-1 masthead
          reason: str,                # filled when ok=False, plain-English
          expectedTokens: list[str],  # report_type significant tokens
        }
    """
    out = {
        'ok': False,
        'extractedName': '',
        'extractedDate': '',
        'nameMatch': False,
        'dateFound': False,
        'reason': '',
        'expectedTokens': _significant_tokens(report_type or ''),
    }

    try:
        import pdfplumber
    except ImportError:
        out['reason'] = 'PDF parser not installed (pdfplumber missing).'
        return out

    try:
        with pdfplumber.open(filepath) as pdf:
            if not pdf.pages:
                out['reason'] = 'PDF has no pages.'
                return out

            # Build paragraphs for page 1 only
            per_page = _build_pdf_paragraphs(pdf)
            page1 = next((paras for pi, paras in per_page if pi == 1), [])
            if not page1:
                out['reason'] = 'Page 1 has no readable text.'
                return out

            ph = page1[0]['page_height']

            # Best name candidate: same logic as auto-detect
            masthead = [
                p for p in page1
                if p['bbox'][1] < ph * 0.25
                and 1 <= p['word_count'] <= 12
                and not DATE_PATTERN.search(p['text'])
            ]
            if masthead:
                masthead.sort(key=lambda p: (-(p['word_count'] if p['word_count'] >= 2 else 0), p['bbox'][1]))
                out['extractedName'] = masthead[0]['text'].strip()

            # Date: scan masthead (top 25%) for any date pattern
            for p in page1:
                if p['bbox'][1] >= ph * 0.25:
                    continue
                m = DATE_PATTERN.search(p['text'])
                if m:
                    out['extractedDate'] = m.group(0).strip()
                    out['dateFound'] = True
                    break

            # Name match check
            if report_type:
                rt_tokens = set(out['expectedTokens'])
                name_tokens = set(_significant_tokens(out['extractedName']))
                shared = rt_tokens & name_tokens
                out['nameMatch'] = bool(shared)

            # Compose verdict
            problems = []
            if report_type and not out['nameMatch']:
                problems.append(
                    f'Report name does not match selected type. '
                    f'Expected keywords from "{report_type}" (any of {sorted(out["expectedTokens"]) or "—"}), '
                    f'but extracted name is "{out["extractedName"] or "(not found)"}".'
                )
            if not out['dateFound']:
                problems.append(
                    'No report date found in the page-1 header. The PDF may be malformed '
                    'or the date is missing from the masthead.'
                )

            if problems:
                out['reason'] = ' '.join(problems)
                out['ok'] = False
            else:
                out['ok'] = True
    except Exception as e:
        out['reason'] = f'Precheck failed: {e}'

    return out


def _detect_report_type_mismatch(report_type, extracted_name, first_page_text):
    """Return a {matched, reason} dict. matched=True if the PDF content looks
    consistent with the chosen report_type; False with a reason if not."""
    if not report_type:
        return {'matched': True, 'reason': ''}
    rt_tokens = set(_significant_tokens(report_type))
    if not rt_tokens:
        return {'matched': True, 'reason': ''}

    # Build a haystack from the extracted report name + first-page text
    haystack_tokens = set(_significant_tokens(extracted_name)) | set(_significant_tokens(first_page_text))
    shared = rt_tokens & haystack_tokens
    if shared:
        return {'matched': True, 'reason': '', 'shared': sorted(shared)}
    return {
        'matched': False,
        'expectedTokens': sorted(rt_tokens),
        'foundName': extracted_name,
        'reason': (
            f'Selected report type "{report_type}" but the PDF contains no matching '
            f'keywords. Extracted report name: "{extracted_name or "(none)"}". '
            f'You probably uploaded the wrong file or selected the wrong template.'
        ),
    }


def _zone(page, x0, y0, x1, y1, tol):
    """Return a cropped pdfplumber region with the given tolerance, clamped to the page."""
    t_x0 = max(0, x0 - tol)
    t_y0 = max(0, y0 - tol)
    t_x1 = min(float(page.width), x1 + tol)
    t_y1 = min(float(page.height), y1 + tol)
    return page.within_bbox((t_x0, t_y0, t_x1, t_y1)), (t_x0, t_y0, t_x1, t_y1)


def _has_text(region, min_words):
    try:
        text = region.extract_text()
        if not text:
            return False
        return len(text.strip().split()) >= min_words
    except Exception:
        return False


def _has_table(region):
    try:
        tables = region.extract_tables() or []
        for t in tables:
            if not t:
                continue
            rows = [r for r in t if r and any(c is not None and str(c).strip() for c in r)]
            if len(rows) >= 2 and len(rows[0]) >= 2:
                return True
        return False
    except Exception:
        return False


def _has_visual(page, zone_bbox):
    """True if zone contains a raster image OR a dense cluster of vector graphics (likely a chart)."""
    t_x0, t_y0, t_x1, t_y1 = zone_bbox
    # Raster images
    if hasattr(page, 'images') and page.images:
        for img in page.images:
            ix0, iy0, ix1, iy1 = img['x0'], img['top'], img['x1'], img['bottom']
            if not (ix1 < t_x0 or ix0 > t_x1 or iy1 < t_y0 or iy0 > t_y1):
                return True
    # Vector chart heuristic: count curves/rects intersecting the zone
    vector_hits = 0
    for collection_name in ('curves', 'rects', 'lines'):
        items = getattr(page, collection_name, None) or []
        for it in items:
            ix0 = it.get('x0', 0); iy0 = it.get('top', 0)
            ix1 = it.get('x1', 0); iy1 = it.get('bottom', 0)
            if not (ix1 < t_x0 or ix0 > t_x1 or iy1 < t_y0 or iy0 > t_y1):
                vector_hits += 1
                if vector_hits >= 5:
                    return True
    return False


def _page_has_type(page, box_type):
    """Page-wide fallback: does the page contain ANY element of this type?"""
    try:
        if box_type in ('text', 'commentary', 'name', 'date', 'heading', 'news'):
            text = page.extract_text() or ''
            return len(text.strip()) > 0
        if box_type == 'table':
            for t in (page.extract_tables() or []):
                rows = [r for r in (t or []) if r and any(c is not None and str(c).strip() for c in r)]
                if len(rows) >= 2 and len(rows[0]) >= 2:
                    return True
            return False
        if box_type in ('chart', 'image'):
            if hasattr(page, 'images') and page.images:
                return True
            curves = getattr(page, 'curves', None) or []
            rects = getattr(page, 'rects', None) or []
            return (len(curves) + len(rects)) >= 5
    except Exception:
        return False
    return False


def _check_box(page, box_type, x0, y0, x1, y1, tol):
    """Try to find the expected element inside the given zone tolerance."""
    region, zone_bbox = _zone(page, x0, y0, x1, y1, tol)
    if box_type == 'commentary':
        return _has_text(region, 30)
    if box_type == 'news':
        return _has_text(region, 15)
    if box_type in ('text', 'name', 'date', 'heading'):
        return _has_text(region, 1)
    if box_type == 'table':
        return _has_table(region)
    if box_type in ('chart', 'image'):
        return _has_visual(page, zone_bbox)
    return False


def _extract_text_in_box(page, x0, y0, x1, y1, tol=10):
    """Pull the actual text inside a bounding box (with a small tolerance).
    Returns a trimmed single-line string, or '' if nothing found."""
    try:
        t_x0 = max(0, x0 - tol)
        t_y0 = max(0, y0 - tol)
        t_x1 = min(float(page.width), x1 + tol)
        t_y1 = min(float(page.height), y1 + tol)
        crop = page.within_bbox((t_x0, t_y0, t_x1, t_y1))
        text = crop.extract_text() or ''
        return re.sub(r'\s+', ' ', text).strip()
    except Exception:
        return ''


def _normalize_text(s):
    """Loose normalization for text-content matching across PDFs."""
    if not s:
        return ''
    return re.sub(r'\s+', ' ', s.lower()).strip()


def _find_text_on_pdf(pdf, needle, prefer_page=None, search_radius=2):
    """Search the PDF for a text snippet (loose match). Returns the 1-indexed page
    number where the needle is found, or None. Prefers prefer_page first, then
    pages within ±search_radius, then the whole document."""
    if not needle:
        return None
    needle_norm = _normalize_text(needle)
    # Use a distinctive substring (first ~50 chars) to avoid false matches
    short = needle_norm[:50]
    if len(short) < 4:
        return None

    def page_matches(page):
        try:
            txt = page.extract_text() or ''
            return short in _normalize_text(txt)
        except Exception:
            return False

    n = len(pdf.pages)
    order = []
    if prefer_page and 1 <= prefer_page <= n:
        order.append(prefer_page)
    for d in range(1, search_radius + 1):
        for cand in (prefer_page + d if prefer_page else None,
                     prefer_page - d if prefer_page else None):
            if cand and 1 <= cand <= n and cand not in order:
                order.append(cand)
    # Then scan the rest of the document
    for i in range(1, n + 1):
        if i not in order:
            order.append(i)

    for pg in order:
        if page_matches(pdf.pages[pg - 1]):
            return pg
    return None


def _run_template_validation(pdf, config, result):
    """Run validation with 3 tiers: strict zone, relaxed zone, page-wide fallback.
    Also extracts the actual text of name/date/heading boxes so the analysis result
    can display 'Report: Pulses Daily Digest | Date: 12 May 2026'."""
    validations = {}        # label -> 'pass' | 'partial' | 'fail'
    extracted = {}          # label -> extracted text (for name/date/heading boxes)
    category_buckets = {}   # category -> {'passed', 'partial', 'total', 'failedLabels'}
    extracted_fields = {'name': '', 'date': ''}
    detail_log = []         # per-element [{label, type, page, status, extractedText}]

    strict_passes = 0
    relaxed_passes = 0
    partial_passes = 0
    total = len(config)

    for box in config:
        label = box.get('label', 'Unknown')
        page_num = int(box.get('page', 1))
        box_type = box.get('type', 'text').lower()
        category = TYPE_TO_CATEGORY.get(box_type, 'Sections')
        heading_text = box.get('heading', '')
        saved_text = (box.get('text') or '').strip()

        bucket = category_buckets.setdefault(
            category,
            {'passed': 0, 'partial': 0, 'total': 0, 'failedLabels': []},
        )
        bucket['total'] += 1

        # Determine which page we should look at in the PDF.
        # If there's an associated heading_text, find it in the PDF first.
        actual_page = page_num
        if heading_text:
            found_page = _find_text_on_pdf(pdf, heading_text, prefer_page=page_num)
            if found_page:
                actual_page = found_page
        elif box_type in ('name', 'date', 'heading') and saved_text:
            found_page = _find_text_on_pdf(pdf, saved_text, prefer_page=page_num)
            if found_page:
                actual_page = found_page

        if actual_page < 1 or actual_page > len(pdf.pages):
            validations[label] = 'fail'
            bucket['failedLabels'].append(label)
            detail_log.append({
                'label': label, 'type': box_type, 'page': page_num,
                'foundOnPage': actual_page,
                'status': 'fail', 'extractedText': '',
            })
            continue

        page = pdf.pages[actual_page - 1]
        x0 = float(box.get('x0', 0))
        y0 = float(box.get('y0', 0))
        x1 = float(box.get('x1', 0))
        y1 = float(box.get('y1', 0))

        status = 'fail'
        try:
            if _check_box(page, box_type, x0, y0, x1, y1, STRICT_TOLERANCE):
                status = 'pass'
                strict_passes += 1
            elif _check_box(page, box_type, x0, y0, x1, y1, RELAXED_TOLERANCE):
                status = 'pass'
                relaxed_passes += 1
            else:
                # Cross-page text-content fallback: if we saved the text content of
                # this element, search neighboring pages for it.
                relocated_page = None
                if saved_text and box_type in ('name', 'date', 'heading', 'commentary', 'text', 'news'):
                    relocated_page = _find_text_on_pdf(pdf, saved_text, prefer_page=actual_page)
                if relocated_page and relocated_page != actual_page:
                    actual_page = relocated_page
                    page = pdf.pages[relocated_page - 1]
                    # Count this as a 'pass' since we found the saved content — just
                    # on a different page. Frontend can show the new page in the log.
                    status = 'pass'
                    relaxed_passes += 1
                elif _page_has_type(page, box_type):
                    status = 'partial'
                    partial_passes += 1
        except Exception:
            status = 'fail'

        # Extract the actual text content for text-like elements so we can
        # display report name / date / heading values in the analysis result.
        extracted_text = ''
        if box_type in ('name', 'date', 'heading', 'text', 'commentary', 'news'):
            extracted_text = _extract_text_in_box(page, x0, y0, x1, y1)

        if extracted_text:
            extracted[label] = extracted_text
            if box_type == 'name':
                # If we don't yet have a name, accept this; if the box also contains a
                # date string and we don't have a date yet, pull the date out too.
                if not extracted_fields['name']:
                    name_only = DATE_PATTERN.sub('', extracted_text).strip(' ,-')
                    extracted_fields['name'] = name_only or extracted_text
                if not extracted_fields['date']:
                    m = DATE_PATTERN.search(extracted_text)
                    if m:
                        extracted_fields['date'] = m.group(0).strip()
            elif box_type == 'date' and not extracted_fields['date']:
                m = DATE_PATTERN.search(extracted_text)
                extracted_fields['date'] = (m.group(0) if m else extracted_text).strip()

        validations[label] = status
        detail_log.append({
            'label': label, 'type': box_type, 'page': page_num,
            'foundOnPage': actual_page,
            'status': status, 'extractedText': extracted_text,
        })
        if status == 'pass':
            bucket['passed'] += 1
        elif status == 'partial':
            bucket['partial'] += 1
            bucket['failedLabels'].append(f'{label} (shifted)')
        else:
            bucket['failedLabels'].append(label)

    # Per-category green/red. Green only when every box in the category is full pass.
    category_status = {}
    for cat in CATEGORY_ORDER:
        if cat not in category_buckets:
            category_status[cat] = 'absent'
        else:
            b = category_buckets[cat]
            # SHIFTED (partial) counts as a pass for the category badge — the
            # element is present in the report, just relocated/resized slightly.
            category_status[cat] = 'green' if (b['passed'] + b['partial']) == b['total'] else 'red'

    result['validationResults'] = validations
    result['extractedText'] = extracted
    result['extractedFields'] = extracted_fields
    result['detailLog'] = detail_log
    result['categoryStatus'] = category_status
    result['categoryDetail'] = category_buckets

    if total > 0:
        # Strict, relaxed, AND partial all count as full passes for scoring —
        # SHIFTED means the element is present, just not at the exact saved
        # coordinates. We still surface 'shifted' as a label so admins can
        # tighten the template if they want.
        full_passes = strict_passes + relaxed_passes + partial_passes
        score = int((full_passes / total) * 100)
        result['qualityScore'] = max(0, min(100, score))
        result['summary'] = (
            f"Template validation: {full_passes}/{total} matched"
            + (f" ({partial_passes} shifted)" if partial_passes else '')
            + f". Score {result['qualityScore']}%."
        )
        if full_passes < total:
            result['warnings'].append(f"Missing {total - full_passes} required elements.")
    else:
        result['summary'] = "Template has no validation rules."
        result['qualityScore'] = 100


DATE_PATTERN = re.compile(
    r'(\b\d{1,2}[\s/\-.]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s/\-.]+\d{2,4}\b'
    r'|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{2,4}\b'
    r'|\b\d{1,2}/\d{1,2}/\d{2,4}\b'
    r'|\b\d{4}-\d{2}-\d{2}\b)',
    re.I,
)


def _normalize_for_dedup(text):
    """Strip variable bits (numbers, dates, page indicators) so the same header on
    different pages collapses to one fingerprint."""
    t = text.lower()
    t = DATE_PATTERN.sub('<date>', t)
    t = re.sub(r'\bpage\s*\d+\s*(of\s*\d+)?\b', '<pageno>', t)
    t = re.sub(r'\d+', '#', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def _build_pdf_paragraphs(pdf):
    """Cluster words into paragraphs per page, splitting at font-size changes so a
    section heading (slightly larger font) never gets glued to the body paragraph
    immediately below it.

    Each paragraph dict: text, bbox, word_count, font_size (dominant), page_height, page_width.
    """
    per_page = []
    for page_idx, page in enumerate(pdf.pages, start=1):
        try:
            words = page.extract_words(use_text_flow=True, extra_attrs=['size']) or []
        except Exception:
            words = []

        # Group words into lines by y-bucket and compute each line's dominant font size
        line_buckets = {}
        for w in words:
            y_key = round(w['top'] / 4) * 4
            line_buckets.setdefault(y_key, []).append(w)
        sorted_lines = [(y, ws) for y, ws in sorted(line_buckets.items()) if ws]

        def dominant_size(ws):
            sizes = [round(float(w.get('size', 0)), 1) for w in ws if w.get('size')]
            if not sizes:
                return 0
            counts = {}
            for s in sizes:
                counts[s] = counts.get(s, 0) + 1
            return max(counts, key=counts.get)

        paragraphs = []
        current = None
        for y, line_words in sorted_lines:
            line_bottom = max(w['bottom'] for w in line_words)
            line_size = dominant_size(line_words)
            if current is None:
                current = {'words': list(line_words), 'last_bottom': line_bottom, 'size': line_size}
            else:
                size_diff = abs(line_size - current['size']) if current['size'] and line_size else 0
                gap = y - current['last_bottom']
                if gap > 12 or size_diff > 0.6:
                    paragraphs.append(current)
                    current = {'words': list(line_words), 'last_bottom': line_bottom, 'size': line_size}
                else:
                    current['words'].extend(line_words)
                    current['last_bottom'] = max(current['last_bottom'], line_bottom)
        if current:
            paragraphs.append(current)

        out_paras = []
        for para in paragraphs:
            if not para['words']:
                continue
            text = ' '.join(w['text'] for w in para['words']).strip()
            if not text:
                continue
            px0 = min(w['x0'] for w in para['words'])
            py0 = min(w['top'] for w in para['words'])
            px1 = max(w['x1'] for w in para['words'])
            py1 = max(w['bottom'] for w in para['words'])
            if (px1 - px0) < 25 or (py1 - py0) < 6:
                continue
            out_paras.append({
                'text': text,
                'bbox': (px0, py0, px1, py1),
                'word_count': len(text.split()),
                'font_size': para['size'],
                'page_height': float(page.height),
                'page_width': float(page.width),
            })
        per_page.append((page_idx, out_paras))
    return per_page


def _detect_vector_charts(page, table_bboxes):
    """Find vector-drawn charts (dense clusters of rects/curves/lines outside tables).
    Conservative: rejects clusters that look like page-wide rulers, tables, or borders."""
    page_w = float(page.width)
    page_h = float(page.height)

    items = []
    for it in (page.rects or []) + (page.curves or []) + (page.lines or []):
        ix0 = it.get('x0', 0); iy0 = it.get('top', 0)
        ix1 = it.get('x1', 0); iy1 = it.get('bottom', 0)
        # Skip items inside or substantially overlapping a detected table
        skip = False
        for (tx0, ty0, tx1, ty1) in table_bboxes:
            if ix0 >= tx0 - 2 and iy0 >= ty0 - 2 and ix1 <= tx1 + 2 and iy1 <= ty1 + 2:
                skip = True
                break
        if skip:
            continue
        # Skip page-wide horizontal rules (separators between sections)
        if (ix1 - ix0) > page_w * 0.6 and (iy1 - iy0) < 2:
            continue
        # Skip degenerate elements
        if (ix1 - ix0) <= 0 and (iy1 - iy0) <= 0:
            continue
        items.append((ix0, iy0, ix1, iy1))

    if len(items) < 20:
        return []

    # Grid-based clustering with smaller cells so unrelated elements don't merge
    cell = 30
    occupied = {}
    for (x0, y0, x1, y1) in items:
        cx0 = int(x0 // cell); cy0 = int(y0 // cell)
        cx1 = int(x1 // cell); cy1 = int(y1 // cell)
        for cx in range(cx0, cx1 + 1):
            for cy in range(cy0, cy1 + 1):
                occupied.setdefault((cx, cy), []).append((x0, y0, x1, y1))

    visited = set()
    clusters = []
    for cell_key in list(occupied):
        if cell_key in visited:
            continue
        stack = [cell_key]
        cluster_cells = []
        while stack:
            ck = stack.pop()
            if ck in visited:
                continue
            visited.add(ck)
            if ck not in occupied:
                continue
            cluster_cells.append(ck)
            cx, cy = ck
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nk = (cx + dx, cy + dy)
                if nk in occupied and nk not in visited:
                    stack.append(nk)
        seen = set()
        cluster_items = []
        for ck in cluster_cells:
            for it in occupied[ck]:
                if id(it) in seen:
                    continue
                seen.add(id(it))
                cluster_items.append(it)
        if len(cluster_items) < 30:
            continue
        x0 = min(it[0] for it in cluster_items)
        y0 = min(it[1] for it in cluster_items)
        x1 = max(it[2] for it in cluster_items)
        y1 = max(it[3] for it in cluster_items)
        w, h = x1 - x0, y1 - y0
        if w < 80 or h < 50:
            continue
        cluster_area = max(1.0, w * h)
        # Reject if the cluster overlaps any table by >25% of cluster area —
        # almost certainly the table's cell borders, not a separate chart.
        overlap_any = False
        for (tx0, ty0, tx1, ty1) in table_bboxes:
            ox = max(0, min(tx1, x1) - max(tx0, x0))
            oy = max(0, min(ty1, y1) - max(ty0, y0))
            if (ox * oy) / cluster_area > 0.25:
                overlap_any = True
                break
        if overlap_any:
            continue
        # Density check: charts are dense (many small items packed close).
        # If the cluster has too few items per 1000 sq pt of area, it's likely
        # just a sparse decoration, not a chart.
        density = len(cluster_items) / (cluster_area / 1000.0)
        if density < 0.4:
            continue
        clusters.append((x0, y0, x1, y1))
    return clusters


def _detect_recurring_text(per_page, page_count):
    """Identify header/footer text by recurrence on most pages near top/bottom edges.
    Returns a set of normalized fingerprints to skip."""
    if page_count < 2:
        return set()

    threshold = max(2, int(page_count * 0.5))
    fingerprint_pages = {}  # fp -> set of page indices
    for page_idx, paras in per_page:
        for p in paras:
            ph = p['page_height']
            top, bottom = p['bbox'][1], p['bbox'][3]
            # Only consider top 12% and bottom 10% as header/footer candidate zones
            if top < ph * 0.12 or bottom > ph * 0.90:
                fp = _normalize_for_dedup(p['text'])
                if fp:
                    fingerprint_pages.setdefault(fp, set()).add(page_idx)
    return {fp for fp, pages in fingerprint_pages.items() if len(pages) >= threshold}


def _detect_watermark_images(pdf):
    """Identify ONLY the agAlabs branding logo — a tiny image that recurs at exactly
    the same position on a strong majority of pages. We intentionally do NOT try to
    filter the diagonal watermark because some reports reuse the same chart-template
    asset on many pages, and over-aggressive filtering removes real charts. Admins
    prune residual watermark detections from the Defined Boxes list.
    """
    page_count = len(pdf.pages)
    skip = set()
    if page_count < 2:
        return skip

    img_records = []
    for page_idx, page in enumerate(pdf.pages, start=1):
        for img in (page.images or []):
            x0, y0, x1, y1 = img['x0'], img['top'], img['x1'], img['bottom']
            img_records.append((page_idx, x0, y0, x1, y1, x1 - x0, y1 - y0))

    bucket_pages = {}
    for rec in img_records:
        page_idx, x0, y0, x1, y1, w, h = rec
        key = (round(x0 / 10) * 10, round(y0 / 10) * 10, round(w / 10) * 10, round(h / 10) * 10)
        bucket_pages.setdefault(key, []).append(rec)
    threshold = max(2, int(page_count * 0.6))
    for key, recs in bucket_pages.items():
        if len({r[0] for r in recs}) >= threshold:
            for rec in recs:
                page_idx, x0, y0, x1, y1, *_ = rec
                skip.add((page_idx, round(x0), round(y0), round(x1), round(y1)))

    return skip


def auto_detect_elements(filepath):
    """Scan a master PDF and return suggested bounding boxes for every detected element.

    Filters applied:
      - Headers/footers recurring on most pages → skipped (but the first short header
        line on page 1 is promoted to type='name').
      - Watermark images (oversized OR appearing at the same bbox on most pages) → skipped.
      - Text falling inside a detected table → skipped.
    """
    try:
        import pdfplumber
    except ImportError:
        return []

    elements = []

    try:
        with pdfplumber.open(filepath) as pdf:
            page_count = len(pdf.pages)
            per_page_paras = _build_pdf_paragraphs(pdf)
            recurring_fps = _detect_recurring_text(per_page_paras, page_count)
            watermark_keys = _detect_watermark_images(pdf)

            name_promoted = False
            date_promoted = False

            for page_idx, page in enumerate(pdf.pages, start=1):
                table_bboxes = []

                # Tables
                try:
                    for i, t in enumerate(page.find_tables() or [], start=1):
                        bbox = t.bbox
                        table_bboxes.append(bbox)
                        # Capture first row as a label hint (so admins see the columns)
                        first_row_text = ''
                        try:
                            rows = t.extract() or []
                            if rows and rows[0]:
                                first_row_text = ' | '.join(
                                    str(c).strip() for c in rows[0] if c is not None and str(c).strip()
                                )[:120]
                        except Exception:
                            pass
                        elements.append({
                            'label': f'Table P{page_idx}-{i}',
                            'type': 'table',
                            'page': page_idx,
                            'x0': round(float(bbox[0]), 2),
                            'y0': round(float(bbox[1]), 2),
                            'x1': round(float(bbox[2]), 2),
                            'y1': round(float(bbox[3]), 2),
                            'text': first_row_text,
                        })
                except Exception:
                    pass

                # Images / Charts from page.images (skip watermarks AND skip images that
                # overlap a detected table — the table wins, the image is just watermark
                # bleed-through behind the table cells).
                chart_index = 0
                image_index = 0
                for img in (page.images or []):
                    ix0, iy0, ix1, iy1 = img['x0'], img['top'], img['x1'], img['bottom']
                    if (page_idx, round(ix0), round(iy0), round(ix1), round(iy1)) in watermark_keys:
                        continue
                    # Overlap with any table on this page → drop (watermark behind the table)
                    img_area = max(1.0, (ix1 - ix0) * (iy1 - iy0))
                    overlaps_table = False
                    for (tx0, ty0, tx1, ty1) in table_bboxes:
                        ox = max(0, min(tx1, ix1) - max(tx0, ix0))
                        oy = max(0, min(ty1, iy1) - max(ty0, iy0))
                        if (ox * oy) / img_area > 0.40:
                            overlaps_table = True
                            break
                    if overlaps_table:
                        continue
                    nearby_curves = 0
                    for c in (getattr(page, 'curves', None) or []):
                        cx0 = c.get('x0', 0); cx1 = c.get('x1', 0)
                        cy0 = c.get('top', 0); cy1 = c.get('bottom', 0)
                        if not (cx1 < ix0 - 30 or cx0 > ix1 + 30 or cy1 < iy0 - 30 or cy0 > iy1 + 30):
                            nearby_curves += 1
                            if nearby_curves >= 5:
                                break
                    box_type = 'chart' if nearby_curves >= 5 else 'image'
                    if box_type == 'chart':
                        chart_index += 1
                        idx = chart_index
                    else:
                        image_index += 1
                        idx = image_index
                    elements.append({
                        'label': f'{box_type.title()} P{page_idx}-{idx}',
                        'type': box_type,
                        'page': page_idx,
                        'x0': round(float(ix0), 2),
                        'y0': round(float(iy0), 2),
                        'x1': round(float(ix1), 2),
                        'y1': round(float(iy1), 2),
                        'text': '',
                    })

                # Vector-drawn charts (clusters of rects/curves/lines outside any table)
                for (vx0, vy0, vx1, vy1) in _detect_vector_charts(page, table_bboxes):
                    # Skip if this cluster is already covered by a raster chart/image
                    already = False
                    for el in elements:
                        if el['page'] != page_idx or el['type'] not in ('chart', 'image'):
                            continue
                        # Overlap ratio > 60% → consider already captured
                        ox = max(0, min(el['x1'], vx1) - max(el['x0'], vx0))
                        oy = max(0, min(el['y1'], vy1) - max(el['y0'], vy0))
                        overlap = ox * oy
                        cluster_area = max(1, (vx1 - vx0) * (vy1 - vy0))
                        if overlap / cluster_area > 0.6:
                            already = True
                            break
                    if already:
                        continue
                    chart_index += 1
                    elements.append({
                        'label': f'Chart P{page_idx}-{chart_index}',
                        'type': 'chart',
                        'page': page_idx,
                        'x0': round(float(vx0), 2),
                        'y0': round(float(vy0), 2),
                        'x1': round(float(vx1), 2),
                        'y1': round(float(vy1), 2),
                        'text': '',
                    })

                # Paragraphs (skip recurring header/footer, skip inside-table)
                paras = next((paras for pi, paras in per_page_paras if pi == page_idx), [])

                # Median body font size — anything sufficiently larger is a heading candidate
                body_sizes = [p['font_size'] for p in paras if p['word_count'] >= 12 and p['font_size']]
                body_size = sorted(body_sizes)[len(body_sizes)//2] if body_sizes else 0

                # Pre-compute "anchor" y-positions on this page for heading look-ahead
                anchor_tops = []
                for (tx0, ty0, tx1, ty1) in table_bboxes:
                    anchor_tops.append(ty0)
                for img in (page.images or []):
                    ix0, iy0, ix1, iy1 = img['x0'], img['top'], img['x1'], img['bottom']
                    if (page_idx, round(ix0), round(iy0), round(ix1), round(iy1)) in watermark_keys:
                        continue
                    anchor_tops.append(iy0)
                for el in elements:
                    if el['page'] == page_idx and el['type'] in ('chart', 'image'):
                        anchor_tops.append(el['y0'])
                for para_a in paras:
                    if para_a['word_count'] >= 30:
                        anchor_tops.append(para_a['bbox'][1])

                # Pre-pick the BEST name candidate for page 1: among short, non-date
                # paragraphs in the top 25% of the page, prefer the one with the most
                # words (≥2). This skips single-word commodity labels like "Pulses" in
                # favor of the descriptive title like "Pulses Daily Digest".
                best_name_para = None
                if page_idx == 1:
                    masthead_candidates = [
                        p for p in paras
                        if p['bbox'][1] < p['page_height'] * 0.25
                        and 1 <= p['word_count'] <= 12
                        and not DATE_PATTERN.search(p['text'])
                    ]
                    if masthead_candidates:
                        # Prefer multi-word descriptive titles. Tie-break: closer to top.
                        masthead_candidates.sort(
                            key=lambda p: (-(p['word_count'] if p['word_count'] >= 2 else 0), p['bbox'][1])
                        )
                        best_name_para = masthead_candidates[0]

                p_idx_local = 0
                # Track the y-bottom of the most recent heading on this page so we can
                # mark "the paragraph directly below it" as commentary.
                last_heading_bottom = None
                current_heading_text = ''
                for para in paras:
                    text = para['text']
                    px0, py0, px1, py1 = para['bbox']
                    ph = para['page_height']

                    # Use the paragraph's TOP for both zone checks so a paragraph that
                    # starts in the body but extends to the bottom of the page (long
                    # bullet lists) isn't wrongly skipped as a footer.
                    in_header_zone = py0 < ph * 0.12
                    in_footer_zone = py0 > ph * 0.92
                    fp = _normalize_for_dedup(text)
                    is_recurring = fp in recurring_fps
                    has_date = bool(DATE_PATTERN.search(text))

                    # Promote the pre-selected best name candidate to 'name'
                    if (
                        page_idx == 1
                        and not name_promoted
                        and best_name_para is para
                    ):
                        p_idx_local += 1
                        elements.append({
                            'label': f'Name P1-{p_idx_local}',
                            'type': 'name',
                            'page': 1,
                            'x0': round(float(px0), 2),
                            'y0': round(float(py0), 2),
                            'x1': round(float(px1), 2),
                            'y1': round(float(py1), 2),
                            'text': text,
                        })
                        name_promoted = True
                        if has_date:
                            date_promoted = True
                        continue

                    # Promote the next short page-1 header paragraph that contains a date
                    if (
                        page_idx == 1
                        and not date_promoted
                        and py0 < ph * 0.25
                        and has_date
                        and para['word_count'] <= 12
                    ):
                        p_idx_local += 1
                        elements.append({
                            'label': f'Date P1-{p_idx_local}',
                            'type': 'date',
                            'page': 1,
                            'x0': round(float(px0), 2),
                            'y0': round(float(py0), 2),
                            'x1': round(float(px1), 2),
                            'y1': round(float(py1), 2),
                            'text': text,
                        })
                        date_promoted = True
                        continue

                    # Skip noise: recurring header/footer text, or anything in the edge zones
                    if is_recurring or in_header_zone or in_footer_zone:
                        continue

                    # Skip text inside a table
                    inside_table = False
                    for (tx0, ty0, tx1, ty1) in table_bboxes:
                        if px0 >= tx0 - 2 and py0 >= ty0 - 2 and px1 <= tx1 + 2 and py1 <= ty1 + 2:
                            inside_table = True
                            break
                    if inside_table:
                        continue

                    # Heading detection — prefer font-size signal, fall back to look-ahead.
                    # Reject obvious footnote/source/disclaimer lines so they never become
                    # a section heading or carry a category badge.
                    is_noise_line = bool(re.match(
                        r'^\s*(source|note|disclaimer|copyright|©|\*|\(?\s*source\s*[:\-])',
                        text, re.I,
                    ))
                    psize = para.get('font_size', 0)
                    is_larger_font = body_size > 0 and psize >= body_size + 0.5
                    near_anchor = False
                    for ay in anchor_tops:
                        if 0 < (ay - py1) <= 100:
                            near_anchor = True
                            break
                    # Reject "AAA AAA AAA AAA" — a single word repeated. This happens
                    # when text extraction stitches together a single column from a
                    # table or a repeating label, and it's never a real heading.
                    words_lc = text.lower().split()
                    is_repetitive = (
                        len(words_lc) >= 3
                        and len(set(words_lc)) == 1
                    )
                    is_heading = (
                        not is_noise_line
                        and not is_repetitive
                        and para['word_count'] <= 10
                        and (is_larger_font or (para['word_count'] <= 8 and near_anchor))
                    )
                    # Two adjacent headings (≤25 pt apart) is almost always a heading +
                    # a subtitle/unit annotation like "(INR/Tonne)". Demote the second
                    # to text so each section has exactly one heading.
                    if (
                        is_heading
                        and last_heading_bottom is not None
                        and (py0 - last_heading_bottom) <= 25
                    ):
                        is_heading = False

                    if is_noise_line:
                        ptype = 'text'
                    elif is_heading:
                        h_lower = text.lower().strip()
                        if 'market update' in h_lower or 'onion' in h_lower:
                            ptype = 'news'
                        else:
                            ptype = 'heading'
                        last_heading_bottom = py1
                        current_heading_text = text
                    elif para['word_count'] >= 30:
                        # Substantial paragraph
                        h_lower = current_heading_text.lower().strip()
                        if 'market update' in h_lower or 'onion' in h_lower:
                            ptype = 'news'
                        else:
                            ptype = 'commentary'
                        # Advance the "in-section" anchor so following short bullets
                        # still get attached if they continue the section.
                        if last_heading_bottom is not None:
                            last_heading_bottom = py1
                    elif (
                        last_heading_bottom is not None
                        and 0 < (py0 - last_heading_bottom) <= 80
                        and para['word_count'] >= 10
                    ):
                        # Shorter paragraph directly under the most recent heading or commentary
                        h_lower = current_heading_text.lower().strip()
                        if 'market update' in h_lower or 'onion' in h_lower:
                            ptype = 'news'
                        else:
                            ptype = 'commentary'
                        last_heading_bottom = py1
                    else:
                        ptype = 'text'

                    p_idx_local += 1
                    elements.append({
                        'label': f'{ptype.title()} P{page_idx}-{p_idx_local}',
                        'type': ptype,
                        'page': page_idx,
                        'x0': round(float(px0), 2),
                        'y0': round(float(py0), 2),
                        'x1': round(float(px1), 2),
                        'y1': round(float(py1), 2),
                        'text': text,
                    })
    except Exception as e:
        return [{'error': f'auto-detect failed: {e}'}]

    # Associate each element with the most recent preceding heading/name/news.
    try:
        elements.sort(key=lambda e: (e.get('page', 1), e.get('y0', 0), e.get('x0', 0)))
        current_heading = ''
        for el in elements:
            if el.get('type') in ('heading', 'name', 'news'):
                current_heading = el.get('text', '')
            el['heading'] = current_heading
    except Exception as e:
        return [{'error': f'auto-detect heading association failed: {e}'}]

    return elements


def _run_legacy_extraction(pdf, result, report_type):
    """Fallback aggregate counting when no template exists for the report type."""
    all_text = ''
    tables_count = 0
    charts_count = 0

    for page in pdf.pages:
        all_text += (page.extract_text() or '') + '\n'

        tables = page.extract_tables() or []
        tables_count += len([t for t in tables if t])

        if hasattr(page, 'images') and page.images:
            charts_count += len(page.images)

    result['tablesCount'] = tables_count
    result['chartsCount'] = charts_count

    lines = all_text.split('\n')
    commentary_words = 0
    for line in lines:
        stripped = line.strip()
        if len(stripped) > 50 and not re.match(r'^[\d\s.,\-]+$', stripped):
            commentary_words += len(stripped.split())

    if commentary_words > 100:
        result['commentaryStatus'] = f'Present ({commentary_words} words)'
    elif commentary_words > 0:
        result['commentaryStatus'] = f'Brief ({commentary_words} words)'
    else:
        result['commentaryStatus'] = 'Not detected'
        result['warnings'].append('No commentary/analysis text found')

    report_type_lower = (report_type or '').lower()
    expected_sections = []
    if 'daily' in report_type_lower:
        expected_sections = ['Prices', 'Arrivals']
    elif 'weekly' in report_type_lower:
        expected_sections = ['Trend', 'Production']

    for exp in expected_sections:
        if exp.lower() not in all_text.lower():
            result['sectionsMissing'].append(exp)

    score = 50
    if tables_count > 0: score += 20
    if charts_count > 0: score += 15
    if commentary_words > 100: score += 15
    score -= len(result['sectionsMissing']) * 5
    result['qualityScore'] = max(0, min(100, score))
    result['summary'] = f"Legacy analysis: {tables_count} tables, {charts_count} charts. Template setup recommended."
