# Word-to-Markdown Converter

[**Live Demo**](https://whit3rabbit.github.io/word-to-markdown-converter/)

A simple, privacy-focused web tool to convert Microsoft Word `.docx` documents into Markdown format directly in your browser. No server-side processing means your documents stay on your computer.

![Screenshot of Word-to-Markdown Converter interface](https://user-images.githubusercontent.com/example-user/example-repo/screenshot.png)  <!-- Optional: Replace with an actual screenshot URL after you upload one -->

## Key Features

*   **Client-Side Conversion:** All processing happens in your browser using JavaScript. Your documents are **never** uploaded to any server, ensuring complete privacy.
*   **`.docx` Support:** Uses the robust [Mammoth.js](https://github.com/mwilliamson/mammoth.js) library to handle `.docx` file conversion.
*   **Markdown Output:** Generates clean Markdown based on the content of your Word document.
*   **Live Preview:** Renders the generated Markdown as HTML (GitHub Flavored Markdown style) using [marked.js](https://github.com/markedjs/marked).
*   **Syntax Highlighting:** Code blocks in the preview are automatically highlighted using [highlight.js](https://highlightjs.org/).
*   **Easy Input:** Drag & Drop your `.docx` file onto the designated area or use the traditional file selector.
*   **Output Actions:**
    *   Copy the generated Markdown to your clipboard.
    *   Download the output as a `.md` file.
    *   Clear the loaded file from memory.
*   **Customizable Conversion (via Settings ⚙️):**
    *   **Image Handling:** Embed images as Base64 data URIs or ignore them completely.
    *   **Bulleted List Style:** Choose between `-`, `*`, or `+` for bullet points.
    *   **Line Breaks:** Convert soft line breaks (Shift+Enter) to trailing double spaces or HTML `<br>` tags.
    *   **Underline Handling:** Ignore underlines, convert them to `<u>` tags, or treat them as *italics*.
    *   **Performance:** Disable the live HTML preview for very large documents to save memory.
*   **Theme Support:** Features Light and Dark modes, automatically respecting your operating system preference, with a manual toggle (🌗).
*   **Memory Management:** Includes warnings for large files and an option to explicitly clear file data from the browser's memory.

## How to Use

1.  Visit the [**Live Demo**](https://whit3rabbit.github.io/word-to-markdown-converter/).
2.  Drag and drop your `.docx` file onto the upload area, or click "Select File" to choose a document.
3.  The generated Markdown will appear in the left pane, and a rendered HTML preview will show on the right.
4.  Use the "Copy Markdown" or "Download .md" buttons as needed.
5.  Click the gear icon (⚙️) in the header to adjust conversion settings. Saved preferences are stored locally in your browser.
6.  Click the clear file button (🧹 - *placeholder, actual button is text*) in the Markdown output controls to remove the document data from memory if working with large or sensitive files.

## Technology Stack

*   HTML5
*   CSS3 (with CSS Variables for theming)
*   Vanilla JavaScript (ES6+)
*   [Mammoth.js](https://github.com/mwilliamson/mammoth.js): For `.docx` conversion.
*   [marked.js](https://github.com/markedjs/marked): For Markdown rendering.
*   [highlight.js](https://highlightjs.org/): For syntax highlighting.

## Why Client-Side?

The primary advantage of this tool is **privacy**. Since the conversion happens entirely within your web browser, your document content never leaves your computer. This is ideal for sensitive or confidential documents where uploading to a third-party server is not desirable.

## Limitations

*   **`.docx` Only:** This tool currently **only** supports the modern `.docx` (Office Open XML) file format created by Microsoft Word 2007 and later.
*   **No `.doc`, `.odt`, `.rtf`:** It does **not** support the older binary `.doc` format, OpenOffice `.odt` files, Rich Text Format `.rtf`, or any other document types.
*   **Complex Features:** Extremely complex Word documents with unusual formatting, macros, or deeply nested elements might not convert perfectly. Mammoth.js focuses on common structural elements and formatting.
*   **Browser Performance:** Very large documents (especially with many embedded images converted to Base64) can consume significant browser memory and may slow down the conversion or preview rendering. Use the "Disable Live Preview" setting if needed.

## Development

No build step is required to run this project locally.

1.  Clone the repository:
    ```bash
    git clone https://github.com/whit3rabbit/word-to-markdown-converter.git
    ```
2.  Navigate to the directory:
    ```bash
    cd word-to-markdown-converter
    ```
3.  Open the `index.html` file directly in your web browser.

## Contributing

Contributions, issues, and feature requests are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License.