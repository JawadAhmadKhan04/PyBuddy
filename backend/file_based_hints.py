from google import genai
import os
from dotenv import load_dotenv
# from langchain_community.document_loaders import PyPDFLoader
import json
import glob
from typing import List, Optional

import fitz  # PyMuPDF

def extract_text_pymupdf(path: str) -> None:
    """
    Extracts and prints text from each page of a PDF using PyMuPDF.

    Args:
        path (str): The file path to the PDF document.
    """
    print("Extracting text from PYMUPDF...")
    doc = fitz.open(path)

    all_text: List[str] = []
    for i, page in enumerate(doc):
        text = page.get_text()
        all_text.append(text)
        print(f"\n--- Page {i+1} ---\n{text}")

def extract_text_and_images_pymupdf(path: str) -> None:
    """
    Extracts text and images from a PDF using PyMuPDF, saves images to disk, and writes text and image references to a TXT file.

    Args:
        path (str): The file path to the PDF document.
    """
    print("Extracting text and images from PYMUPDF...")
    doc = fitz.open(path)
    pdf_base = os.path.splitext(os.path.basename(path))[0]
    output_dir = os.path.join(os.path.dirname(path), pdf_base + "_output")
    os.makedirs(output_dir, exist_ok=True)
    output_lines: List[str] = []
    for page_num, page in enumerate(doc, start=1):
        blocks = page.get_text("dict")['blocks']
        for block in blocks:
            if block['type'] == 0:  # text block
                for line in block['lines']:
                    line_text = " ".join(span['text'] for span in line['spans'])
                    if line_text.strip():
                        output_lines.append(line_text)
            elif block['type'] == 1:  # image block
                img_data = block.get('image')
                img_index = sum(1 for l in output_lines if l.startswith('{') and l.endswith('}')) + 1
                if isinstance(img_data, int):
                    try:
                        img_info = doc.extract_image(img_data)
                        img_bytes = img_info['image']
                        img_ext = img_info['ext']
                        img_filename = f"{pdf_base}_page{page_num}_img{img_index}.{img_ext}"
                        img_path = os.path.join(output_dir, img_filename)
                        with open(img_path, 'wb') as img_file:
                            img_file.write(img_bytes)
                        output_lines.append(f"{{{img_filename}}}")
                    except Exception as e:
                        print(f"Warning: Could not extract image with xref {img_data}: {e}")
                elif isinstance(img_data, bytes):
                    # Raw image data: guess format from header
                    if img_data.startswith(b'\x89PNG'):
                        img_ext = 'png'
                    elif img_data.startswith(b'\xff\xd8'):
                        img_ext = 'jpg'
                    else:
                        img_ext = 'bin'
                    img_filename = f"{pdf_base}_page{page_num}_img{img_index}.{img_ext}"
                    img_path = os.path.join(output_dir, img_filename)
                    with open(img_path, 'wb') as img_file:
                        img_file.write(img_data)
                    output_lines.append(f"{{{img_filename}}}")
                else:
                    print(f"Skipping image block with unknown image data type: {type(img_data)}")
        # Optionally, add a page break
        output_lines.append(f"\n--- End of Page {page_num} ---\n")
    # Save the output TXT
    txt_filename = f"{pdf_base}_content.txt"
    txt_path = os.path.join(output_dir, txt_filename)
    with open(txt_path, 'w', encoding='utf-8') as f:
        for line in output_lines:
            f.write(line + '\n')
    print(f"✅ Extracted text and image references saved. Text structure: {txt_path}")

def process_pdfs_in_folder(folder_path: str) -> None:
    """
    Processes all PDF files in a given folder, extracting text and images from each.

    Args:
        folder_path (str): The path to the folder containing PDF files.
    """
    pdf_files = glob.glob(os.path.join(folder_path, '*.pdf'))
    if not pdf_files:
        print(f"No PDF files found in {folder_path}")
        return
    for pdf_file in pdf_files:
        print(f"\nProcessing: {pdf_file}")
        extract_text_and_images_pymupdf(pdf_file)

load_dotenv()

class FileBasedHints:
    """
    A class to handle file-based hint generation using a language model.
    """
    def __init__(self, file_path: str) -> None:
        """
        Initializes the FileBasedHints class.

        Args:
            file_path (str): The path to the file to process.
        """
        self.file_path = file_path
        self.model = "gemini-2.5-flash"
        # self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        # self.client = genai.Client(api_key=self.gemini_api_key)
        
    def preprocess_file(self) -> None:
        """
        Preprocesses the file by extracting text and images.
        """
        print("Preprocessing file...")
        print("model: ", self.model)
        extract_text_and_images_pymupdf(self.file_path)

        
        
    
    def generate_hints(self) -> None:
        """
        Generates hints for the file using the language model.
        """
        print("Generating hints...")
        # response = self.client.models.generate_content(
        #     model=self.model, contents="Explain how AI works in a few words"
        # )
        # print(response.text)