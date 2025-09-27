# real-time-document-editor-for-financial-trading-floors<br>
Creating  a real time document editor for financial trading floors<br>
Set up flask environment as follows:<br>
1. redirect your terminal to your working directory<br>
2.Run these commands in this order<br>
    a.To get venv environment in your folder:
      py -3 -m venv .venv<br>
    b. Activate scripts:
      .venv\Scripts\activate<br>
    c. Install flask:
      pip install Flask<br>
    d. Exit venv: 
      deactivate<br>
    For concurrent edits will need y.js
    install with: npm install yjs y-websocket y-codemirror codemirror and then to run server for websocket handling: <br>
    npx y-websocket-server --port 1234