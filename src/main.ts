import * as pdfjsLib from 'pdfjs-dist';
import OpenAI from 'openai';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let pdfDoc: any = null;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let lastX = 0;
let lastY = 0;
let openai: OpenAI | null = null;
let pageEmbeddings: { pageNum: number; text: string; embedding: number[] }[] = [];

const statusEl = document.getElementById('status')!;

function updateStatus(msg: string) {
  statusEl.textContent = msg;
}

function draw() {
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Infinite canvas grid
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  const gridSize = 50 * scale;
  for (let x = offsetX % gridSize; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = offsetY % gridSize; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function addScreenshot(pageNum: number, x: number, y: number) {
  if (!pdfDoc) return;
  pdfDoc.getPage(pageNum).then((page: any) => {
    const viewport = page.getViewport({ scale: scale * 1.5 });
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCanvas.width = viewport.width;
    tempCanvas.height = viewport.height;
    page.render({ canvasContext: tempCtx, viewport }).promise.then(() => {
      ctx.drawImage(tempCanvas, x + offsetX, y + offsetY, viewport.width, viewport.height);
      updateStatus(`Added page ${pageNum} screenshot at canvas position`);
    });
  });
}

// Infinite canvas pan/zoom
canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener('mouseup', () => isDragging = false);
canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  offsetX += e.clientX - lastX;
  offsetY += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  draw();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  scale *= zoomFactor;
  draw();
});

document.getElementById('clear')!.addEventListener('click', () => {
  draw();
  updateStatus('Canvas cleared');
});

document.getElementById('upload')!.addEventListener('change', async (e: any) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const data = new Uint8Array(reader.result as ArrayBuffer);
    pdfDoc = await pdfjsLib.getDocument(data).promise;
    updateStatus(`Loaded PDF with ${pdfDoc.numPages} pages. Ready for queries.`);
    draw();
  };
  reader.readAsArrayBuffer(file);
});

// OpenAI + RAG setup
document.getElementById('apikey')!.addEventListener('change', (e: any) => {
  const key = e.target.value.trim();
  if (key) {
    openai = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
    updateStatus('OpenAI client ready. PDF will be indexed for RAG.');
  }
});

async function indexPDF() {
  if (!pdfDoc || !openai) return;
  pageEmbeddings = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item: any) => item.str).join(' ').slice(0, 4000);
    const embeddingRes = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
    pageEmbeddings.push({ pageNum: i, text, embedding: embeddingRes.data[0].embedding });
    updateStatus(`Indexed page ${i}/${pdfDoc.numPages}`);
  }
  updateStatus('RAG index complete. Ready for voice queries.');
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (magA * magB);
}

async function findRelevantPage(query: string): Promise<number> {
  if (!openai || pageEmbeddings.length === 0) return Math.floor(Math.random() * (pdfDoc?.numPages || 1)) + 1;
  const embRes = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query });
  const qEmb = embRes.data[0].embedding;
  let best = pageEmbeddings[0];
  let bestScore = -1;
  for (const p of pageEmbeddings) {
    const score = cosineSimilarity(qEmb, p.embedding);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: `Answer this Harley service question using only this manual excerpt: ${best.text}\n\nQuestion: ${query}` }]
  });
  return best.pageNum;
}

// Voice interaction
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let recognition: any;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
}

document.getElementById('speak')!.addEventListener('click', async () => {
  if (!recognition || !pdfDoc) {
    updateStatus('Voice not supported or no PDF loaded.');
    return;
  }
  if (openai && pageEmbeddings.length === 0) await indexPDF();
  recognition.start();
  updateStatus('Listening...');
});

recognition.onresult = async (event: any) => {
  const query = event.results[0][0].transcript;
  updateStatus(`Query: "${query}". Processing with OpenAI RAG...`);
  const pageNum = await findRelevantPage(query);
  const posX = 200 + Math.random() * 400;
  const posY = 200 + Math.random() * 400;
  addScreenshot(pageNum, posX, posY);
  const utterance = new SpeechSynthesisUtterance(`Found relevant info on page ${pageNum}. Here is the screenshot.`);
  window.speechSynthesis.speak(utterance);
  updateStatus(`Response for page ${pageNum} complete.`);
};

recognition.onerror = () => updateStatus('Voice recognition error.');

draw();
updateStatus('Upload your Harley electronic SVC manual PDF and enter OpenAI key to begin.');