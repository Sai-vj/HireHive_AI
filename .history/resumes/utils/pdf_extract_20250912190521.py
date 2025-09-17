# resumes/utils/pdf_extract.py
import io
import logging
import contextlib
import os,sys


if os.name=="nt":
    devnull="NUL"
else:
    devnul="/dev/null"
    
    
    
os.environ.setdefault("PYTHONWARNINGS","ignore")

import logging
logging.getLogger("pdf2image").setLevel(logging.ERROR)
logging.getLogger("PIL").setLevel(logging.ERROR)
logging.getLogger("pdfminer").setLevel(logging.ERROR)

logger = logging.getLogger(__name__)

# try pdfminer high-level, fallback to pdfplumber / PyPDF2
try:
    from pdfminer.high_level import extract_text as _pdfminer_extract_text

    def _try_pdfminer(fp):
        # pdfminer accepts path or file-like; we'll pass bytes buffer
        try:
            if hasattr(fp, "read"):
                data = fp.read()
                return _pdfminer_extract_text(io.BytesIO(data))
            return _pdfminer_extract_text(fp)
        except Exception:
            logger.exception("pdfminer extraction failed")
            return None
except Exception:
    _pdfminer_extract_text = None

    def _try_pdfminer(fp):
        return None


try:
    import pdfplumber

    def _try_pdfplumber(fp):
        try:
            text_parts = []
            if hasattr(fp, "read"):
                # pdfplumber expects a filename or file-like; use bytesIO
                f = io.BytesIO(fp.read())
            else:
                f = fp
            with pdfplumber.open(f) as pdf:
                for p in pdf.pages:
                    text_parts.append(p.extract_text() or "")
            return "\n".join(text_parts)
        except Exception:
            logger.exception("pdfplumber extraction failed")
            return None
except Exception:
    _try_pdfplumber = lambda fp: None


try:
    import PyPDF2

    def _try_pypdf2(fp):
        try:
            text_parts = []
            if hasattr(fp, "read"):
                reader = PyPDF2.PdfReader(io.BytesIO(fp.read()))
            else:
                reader = PyPDF2.PdfReader(fp)
            for p in reader.pages:
                try:
                    text_parts.append(p.extract_text() or "")
                except Exception:
                    text_parts.append("")
            return "\n".join(text_parts)
        except Exception:
            logger.exception("PyPDF2 extraction failed")
            return None
except Exception:
    _try_pypdf2 = lambda fp: None


# Optional OCR fallback (requires pytesseract and PIL + tesseract installed)
try:
    import pytesseract
    from PIL import Image
    from pdf2image import convert_from_bytes, convert_from_path

    def _try_ocr(fp, poppler_path=None, tesseract_lang=None):
        """
        Convert PDF to images using pdf2image (poppler) and run pytesseract OCR.
        Suppresses poppler/pdf2image stderr so terminal is not spammed with font/pdfinfo warnings.

        - fp: file-like with .read() or a path (string / pathlike)
        - poppler_path: optional path to poppler 'bin' (Windows). If None, rely on PATH.
        - tesseract_lang: optional language code for pytesseract (e.g. 'eng')
        """
        try:
            # capture poppler/pdf2image stderr (these are printed by poppler/pdfinfo)
            stderr_buf = io.StringIO()
            with contextlib.redirect_stderr(stderr_buf):
                if hasattr(fp, "read"):
                    pdf_bytes = fp.read()
                    if poppler_path:
                        pages = convert_from_bytes(pdf_bytes, poppler_path=poppler_path)
                    else:
                        pages = convert_from_bytes(pdf_bytes)
                else:
                    # path-like
                    if poppler_path:
                        pages = convert_from_path(fp, poppler_path=poppler_path)
                    else:
                        pages = convert_from_path(fp)

            text_pages = []
            for img in pages:
                # ensure image is PIL Image; pytesseract accepts it directly
                if tesseract_lang:
                    text_pages.append(pytesseract.image_to_string(img, lang=tesseract_lang))
                else:
                    text_pages.append(pytesseract.image_to_string(img))
            return "\n".join(text_pages)
        except Exception:
            # keep the exception logged, but suppress poppler stderr messages
            logger.exception("OCR extraction failed")
            return None

except Exception:
    _try_ocr = lambda fp, *a, **k: None


def extract_text_from_filefield(file_field):
    """
    Given a Django FieldFile / UploadedFile or a path-like string,
    try several extractors and return text safely.
    """
    if file_field is None:
        return ""

    file_obj = file_field
    file_path = None

    # Handle Django FieldFile / UploadedFile
    try:
        if hasattr(file_field, "file"):
            try:
                file_field.open()
            except Exception:
                pass
            file_obj = file_field.file
        if hasattr(file_field, "path"):
            file_path = file_field.path
    except Exception:
        pass

    if isinstance(file_field, (str, bytes, os.PathLike)):
        file_path = file_field

    # Read raw bytes safely
    raw_bytes = None
    try:
        if hasattr(file_obj, "read"):
            try:
                if hasattr(file_obj, "seek"):
                    file_obj.seek(0)
            except Exception:
                pass
            raw_bytes = file_obj.read()
            if isinstance(raw_bytes, str):
                raw_bytes = raw_bytes.encode("utf-8", errors="ignore")
            if (not raw_bytes or len(raw_bytes) == 0) and file_path:
                with open(file_path, "rb") as f:
                    raw_bytes = f.read()
        elif file_path:
            with open(file_path, "rb") as f:
                raw_bytes = f.read()
    except Exception:
        raw_bytes = None

    if not raw_bytes:
        return ""

    # Always give fresh BytesIO to each extractor
    try:
        if _pdfminer_extract_text:
            txt = _try_pdfminer(io.BytesIO(raw_bytes))
            if txt and txt.strip():
                return txt
    except Exception:
        pass

    try:
        txt = _try_pdfplumber(io.BytesIO(raw_bytes))
        if txt and txt.strip():
            return txt
    except Exception:
        pass

    try:
        txt = _try_pypdf2(io.BytesIO(raw_bytes))
        if txt and txt.strip():
            return txt
    except Exception:
        pass

    #try:
        #txt = _try_ocr(io.BytesIO(raw_bytes))
        #if txt and txt.strip():
            #return txt
    #except Exception:
        #pass

   # return ""



