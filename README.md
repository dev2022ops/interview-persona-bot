# interview-persona-bot

**AI Interview Agent**: a chatbot that helps you prepare for AI roles:

- AI Product Manager
- Forward Deployed Engineer
- AI Researcher

Pick the role you're interviewing for and the coach adapts: its prompt, starter questions and
accent colours change per role, and each role keeps its own conversation. It runs mock interviews
(one question at a time, with feedback), explains concepts, and helps tighten your answers.

Built with Vite (vanilla JS) and Google's Gemini API (`gemini-3.8-flash`).

## Run it

```bash
npm install
npm run dev
```

Open the printed URL and paste your Gemini API key (get one at
https://aistudio.google.com/apikey). The key is saved in your browser's localStorage and sent only
to `generativelanguage.googleapis.com`.

## Project layout

- `src/personas.js`: per-role system prompts, greetings, starter questions and colours
- `src/gemini.js`: streaming call to the Gemini API (change `MODEL` here)
- `src/main.js`: UI: role switching, chat, API key dialog
- `src/markdown.js`: small HTML-safe Markdown renderer for replies
- `src/style.css`: neon/grid theme
