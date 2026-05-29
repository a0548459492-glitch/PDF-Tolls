pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

    // ניהול מעבר בין טאבים
    function openTab(tabId) {
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        event.currentTarget.classList.add('active');
    }

    function setStatus(id, text, type) {
        const el = document.getElementById(id);
        el.innerText = text;
        el.className = 'status ' + type;
    }

    function updateSingleFileName(input, divId) {
        const div = document.getElementById(divId);
        if(input.files.length > 0) {
            div.innerText = `קובץ שנבחר: ${input.files[0].name}`;
            div.style.color = "var(--success)";
        } else {
            div.innerText = "";
        }
    }

    function readFileAsBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    // --- לוגיקת כלי החוברת (Booklet) החדש ---
    async function runBooklet() {
        const file = document.getElementById('booklet-file').files[0];
        if (!file) {
            setStatus('booklet-status', 'אנא בחר קובץ PDF ליצירת חוברת.', 'error');
            return;
        }
        try {
            setStatus('booklet-status', 'מנתח ומסדר עמודים למבנה חוברת...', 'info');
            const direction = document.querySelector('input[name="booklet-direction"]:checked').value;

            const bytes = await readFileAsBuffer(file);
            const srcPdfDoc = await PDFLib.PDFDocument.load(bytes);
            const bookletPdfDoc = await PDFLib.PDFDocument.create();

            const pageCount = srcPdfDoc.getPageCount();
            const remainder = pageCount % 4;
            const targetPageCount = remainder === 0 ? pageCount : pageCount + (4 - remainder);

            // בניית סדר הדפים הנכון לפי כיוון קריאה
            const bookletOrder = [];
            let left = 0;
            let right = targetPageCount - 1;

            while (left < right) {
                // צמד חיצוני
                if (direction === 'rtl') {
                    bookletOrder.push(right);
                    bookletOrder.push(left);
                } else {
                    bookletOrder.push(left);
                    bookletOrder.push(right);
                }
                left++;
                right--;

                // צמד פנימי
                if (left < right) {
                    if (direction === 'rtl') {
                        bookletOrder.push(left);
                        bookletOrder.push(right);
                    } else {
                        bookletOrder.push(right);
                        bookletOrder.push(left);
                    }
                    left++;
                    right--;
                }
            }

            // יצירת ה-PDF החדש לפי סדר החוברת שחושב
            for (const origIndex of bookletOrder) {
                if (origIndex !== null && origIndex < pageCount) {
                    const [copiedPage] = await bookletPdfDoc.copyPages(srcPdfDoc, [origIndex]);
                    bookletPdfDoc.addPage(copiedPage);
                } else {
                    // הוספת דף חלק בגודל הדף הראשון
                    let width = 595.28; 
                    let height = 841.89; 
                    if (pageCount > 0) {
                        const firstPage = srcPdfDoc.getPage(0);
                        width = firstPage.getWidth();
                        height = firstPage.getHeight();
                    }
                    bookletPdfDoc.addPage([width, height]);
                }
            }

            const pdfBytes = await bookletPdfDoc.save();
            downloadBlob(pdfBytes, `booklet_ordered_${direction}.pdf`, 'application/pdf');
            setStatus('booklet-status', 'החוברת סודרה בהצלחה והורדה למחשב!', 'success');

        } catch(e) {
            setStatus('booklet-status', 'אירעה שגיאה בעיבוד החוברת: ' + e.message, 'error');
        }
    }

    // --- לוגיקת מיזוג קבצים עם שינוי סדר ---
    let mergeFilesArray = [];

    function handleMergeFilesSelect(input) {
        for(let file of input.files) {
            mergeFilesArray.push(file);
        }
        renderMergeFileList();
    }

    function renderMergeFileList() {
        const listDiv = document.getElementById('merge-file-list');
        listDiv.innerHTML = '';
        if(mergeFilesArray.length === 0) { listDiv.style.display = 'none'; return; }
        listDiv.style.display = 'block';

        mergeFilesArray.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `
                <div class="file-name-txt">${index + 1}. ${file.name}</div>
                <div class="file-actions">
                    <button class="sort-btn" onclick="moveFile(${index}, -1)" ${index === 0 ? 'disabled' : ''}>▲ למעלה</button>
                    <button class="sort-btn" onclick="moveFile(${index}, 1)" ${index === mergeFilesArray.length - 1 ? 'disabled' : ''}>▼ למטה</button>
                    <button class="sort-btn" style="color:var(--danger);" onclick="removeFile(${index})">הסר</button>
                </div>
            `;
            listDiv.appendChild(item);
        });
    }

    function moveFile(index, direction) {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= mergeFilesArray.length) return;
        const temp = mergeFilesArray[index];
        mergeFilesArray[index] = mergeFilesArray[targetIndex];
        mergeFilesArray[targetIndex] = temp;
        renderMergeFileList();
    }

    function removeFile(index) {
        mergeFilesArray.splice(index, 1);
        renderMergeFileList();
    }

    async function runMerge() {
        if (mergeFilesArray.length < 2) { setStatus('merge-status', 'אנא בחר לפחות שני קבצים.', 'error'); return; }
        try {
            setStatus('merge-status', 'ממזג קבצים...', 'info');
            const mergedPdf = await PDFLib.PDFDocument.create();
            for (let file of mergeFilesArray) {
                const bytes = await readFileAsBuffer(file);
                const pdf = await PDFLib.PDFDocument.load(bytes);
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach(page => mergedPdf.addPage(page));
            }
            const mergedBytes = await mergedPdf.save();
            downloadBlob(mergedBytes, 'merged_document.pdf', 'application/pdf');
            setStatus('merge-status', 'המיזוג הושלם בהצלחה!', 'success');
        } catch(e) { setStatus('merge-status', 'שגיאה: ' + e.message, 'error'); }
    }

    // --- לוגיקת חילוץ לפי טווחים מרובים ---
    async function runExtract() {
        const file = document.getElementById('extract-file').files[0];
        const rangeInput = document.getElementById('extract-ranges').value.trim();
        if (!file) { setStatus('extract-status', 'אנא בחר קובץ PDF.', 'error'); return; }
        if (!rangeInput) { setStatus('extract-status', 'אנא הזן טווח עמודים.', 'error'); return; }
        
        try {
            setStatus('extract-status', 'מחלץ עמודים...', 'info');
            const bytes = await readFileAsBuffer(file);
            const srcPdf = await PDFLib.PDFDocument.load(bytes);
            const totalPages = srcPdf.getPageCount();
            const targetIndices = [];
            const parts = rangeInput.split(',');

            for (let part of parts) {
                part = part.trim();
                if (part.includes('-')) {
                    const rangeParts = part.split('-');
                    const start = parseInt(rangeParts[0]);
                    const end = parseInt(rangeParts[1]);
                    if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
                        throw new Error(`הטווח ${part} אינו תקין.`);
                    }
                    for (let i = start; i <= end; i++) targetIndices.push(i - 1);
                } else {
                    const pageNum = parseInt(part);
                    if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
                        throw new Error(`העמוד ${part} אינו קיים.`);
                    }
                    targetIndices.push(pageNum - 1);
                }
            }

            const newPdf = await PDFLib.PDFDocument.create();
            const copiedPages = await newPdf.copyPages(srcPdf, targetIndices);
            copiedPages.forEach(page => newPdf.addPage(page));
            const pdfBytes = await newPdf.save();
            downloadBlob(pdfBytes, `extracted_pages.pdf`, 'application/pdf');
            setStatus('extract-status', 'החילוץ הושלם בהצלחה!', 'success');
        } catch(e) { setStatus('extract-status', e.message, 'error'); }
    }

    // --- פיצול ל-ZIP ---
    async function runSplit() {
        const file = document.getElementById('split-file').files[0];
        if (!file) { setStatus('split-status', 'אנא בחר קובץ.', 'error'); return; }
        try {
            setStatus('split-status', 'מפצל דפים ל-ZIP...', 'info');
            const bytes = await readFileAsBuffer(file);
            const srcPdf = await PDFLib.PDFDocument.load(bytes);
            const pageCount = srcPdf.getPageCount();
            const zip = new JSZip();
            
            for (let i = 0; i < pageCount; i++) {
                const newPdf = await PDFLib.PDFDocument.create();
                const [page] = await newPdf.copyPages(srcPdf, [i]);
                newPdf.addPage(page);
                const pdfBytes = await newPdf.save();
                zip.file(`page_${i + 1}.pdf`, pdfBytes);
            }
            const zipContent = await zip.generateAsync({type: "blob"});
            downloadBlob(zipContent, 'split_pages.zip', 'application/zip');
            setStatus('split-status', 'הפיצול הסתיים בהצלחה!', 'success');
        } catch(e) { setStatus('split-status', 'שגיאה: ' + e.message, 'error'); }
    }

    // --- כווץ והמרת תמונות ---
    async function convertPdfToImages(arrayBuffer, qualityScale = 1.2) {
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        const images = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({scale: qualityScale});
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({canvasContext: context, viewport: viewport}).promise;
            const imgData = canvas.toDataURL('image/jpeg', 0.65);
            images.push({data: imgData, width: viewport.width, height: viewport.height});
        }
        return images;
    }

    async function runToImg() {
        const file = document.getElementById('to-img-file').files[0];
        if (!file) { setStatus('to-img-status', 'אנא בחר קובץ.', 'error'); return; }
        try {
            setStatus('to-img-status', 'ממיר דפים לתמונות...', 'info');
            const bytes = await readFileAsBuffer(file);
            const images = await convertPdfToImages(bytes, 1.8);
            const zip = new JSZip();
            images.forEach((img, index) => {
                const base64Data = img.data.split(',')[1];
                zip.file(`page_${index + 1}.jpg`, base64Data, {base64: true});
            });
            const zipContent = await zip.generateAsync({type: "blob"});
            downloadBlob(zipContent, 'pdf_images.zip', 'application/zip');
            setStatus('to-img-status', 'ההורדה הושלמה!', 'success');
        } catch(e) { setStatus('to-img-status', 'שגיאה: ' + e.message, 'error'); }
    }

    async function runCompress() {
        const file = document.getElementById('compress-file').files[0];
        if (!file) { setStatus('compress-status', 'אנא בחר קובץ.', 'error'); return; }
        try {
            setStatus('compress-status', 'מכווץ את המסמך...', 'info');
            const bytes = await readFileAsBuffer(file);
            const images = await convertPdfToImages(bytes, 0.9);
            const newPdf = await PDFLib.PDFDocument.create();
            for (let img of images) {
                const embeddedImg = await newPdf.embedJpg(img.data);
                const page = newPdf.addPage([img.width, img.height]);
                page.drawImage(embeddedImg, { x: 0, y: 0, width: img.width, height: img.height });
            }
            const compressedBytes = await newPdf.save();
            downloadBlob(compressedBytes, 'compressed_document.pdf', 'application/pdf');
            setStatus('compress-status', 'הקובץ כווץ בהצלחה!', 'success');
        } catch(e) { setStatus('compress-status', 'שגיאה: ' + e.message, 'error'); }
    }

    function downloadBlob(data, fileName, mimeType) {
        const blob = new Blob([data], {type: mimeType});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
    }