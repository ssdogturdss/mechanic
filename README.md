# Mechanic - Harley SVC AI Assistant

Production-ready infinite canvas + voice AI for Harley service manuals.

**Run:** npm install && npm run dev

**Features implemented:**
- Upload PDF (Harley electronic SVC manual)
- Infinite canvas with pan/zoom/grid
- Voice input via mic button
- AI agent (simulated LLM + PDF page extraction) finds relevant page, screenshots it onto canvas
- Verbal TTS response explaining result

**Production notes:** Full LLM+RAG requires OpenAI API key + backend for accurate search over PDF text. Current version uses demo page selection and full voice/canvas UX ready for extension.

Upload PDF, click Speak, ask questions about the manual. Screenshots appear on canvas.