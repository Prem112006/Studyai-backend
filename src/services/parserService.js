import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import officeParser from 'officeparser';

/**
 * Custom PDF page renderer to handle spacing issues.
 * Adds spaces between adjacent text items on the same line if they are separate words.
 */
const spacerRenderPage = (pageData) => {
  return pageData.getTextContent({ normalizeWhitespace: true })
    .then(function(textContent) {
      let lastY, lastX, lastWidth, text = '';
      
      for (let item of textContent.items) {
        let x = item.transform[4];
        let y = item.transform[5];
        let str = item.str;
        let width = item.width;

        if (!lastY) {
          text += str;
        } else if (Math.abs(y - lastY) > 2) {
          text += '\n' + str;
        } else {
          let distance = x - (lastX + lastWidth);
          let needsSpace = false;
          if (lastX !== undefined && lastWidth !== undefined) {
            // Threshold of -1.0 catches closely positioned adjacent words
            if (distance > -1.0) {
              needsSpace = true;
            }
          }

          // No space before punctuation marks
          if (needsSpace && /^[.,;:!?\)\}\]]/.test(str)) {
            needsSpace = false;
          }

          // No space immediately after opening brackets or quotes
          if (needsSpace && /[\(\[\{\'\"]$/.test(text)) {
            needsSpace = false;
          }

          // No space if either string already contains space at boundary
          if (needsSpace && (str.startsWith(' ') || text.endsWith(' '))) {
            needsSpace = false;
          }

          if (needsSpace) {
            text += ' ' + str;
          } else {
            text += str;
          }
        }

        lastY = y;
        lastX = x;
        lastWidth = width;
      }
      return text;
    });
};

/**
 * Extract text from PDF file
 */
export const parsePDF = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const parsedData = await pdfParse(dataBuffer, { pagerender: spacerRenderPage });
    return parsedData.text;
  } catch (error) {
    console.error(`PDF parsing failed: ${error.message}`);
    throw new Error('Failed to parse PDF document');
  }
};

/**
 * Extract text from Word DOCX file
 */
export const parseDOCX = async (filePath) => {
  try {
    const data = await mammoth.extractRawText({ path: filePath });
    return data.value;
  } catch (error) {
    console.error(`DOCX parsing failed: ${error.message}`);
    throw new Error('Failed to parse Word document');
  }
};

/**
 * Extract text from TXT file
 */
export const parseTXT = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`TXT parsing failed: ${error.message}`);
    throw new Error('Failed to parse Text document');
  }
};

/**
 * Extract text from PPTX PowerPoint file
 */
export const parsePPTX = async (filePath) => {
  try {
    const ast = await officeParser.parseOffice(filePath);
    return ast.toText();
  } catch (error) {
    console.error(`PPTX parsing failed: ${error.message}`);
    throw new Error('Failed to parse PowerPoint presentation');
  }
};

/**
 * Dispatch parsing based on file extension
 */
export const extractTextFromFile = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.pdf') {
    return await parsePDF(filePath);
  } else if (ext === '.docx') {
    return await parseDOCX(filePath);
  } else if (ext === '.pptx') {
    return await parsePPTX(filePath);
  } else if (ext === '.txt') {
    return parseTXT(filePath);
  } else {
    throw new Error('Unsupported file extension. Supported formats: .pdf, .docx, .pptx, .txt');
  }
};
