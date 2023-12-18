import { Event } from './Event.js';
import { Chats } from './models/Chats.js';
import { LocalStorage } from './models/LocalStorage.js';
import { Sidebar } from './Sidebar.js';
import { ChatArea } from './ChatArea.js';

// Configuration and DOM elements
const storage = new LocalStorage();

export class App {
  constructor() {
    this.controller = null;
    this.chats = new Chats();
    this.sidebar = new Sidebar(this.chats);
    this.chatArea = new ChatArea(this.chats);
    this.initializeElements();
    this.render();
    this.bindEventListeners();
    this.logInitialization();
  }

  initializeElements() {
    this.sendButton = document.getElementById('send-button');
    this.abortButton = document.getElementById('abort-button');
    this.messageInput = document.getElementById('message-input');
    this.chatHistory = document.getElementById('chat-history');
  }

  logInitialization() {
    let msg = `~~~\nOllama HTML UI\n~~~
Model: ${storage.get('model')}
URL:   ${storage.get('url')}
Chat:  ${this.chats.getCurrentChat()?.id}
`;
    console.log(msg);
  }

  render() {
    // Render logic here
  }

  bindEventListeners() {
    Event.listen('chatSelected', this.handleChatSelected);
    this.sendButton.addEventListener('click', this.sendMessage);
    this.abortButton.addEventListener("click", this.handleAbort);
    this.messageInput.addEventListener('keypress', this.handleKeyPress);
  }

  handleChatSelected = () => {
    const chat = this.chats.getCurrentChat();
    window.history.pushState({}, '', `/chats/${chat.id}`);
    this.chatHistory.innerHTML = chat.content;
    this.messageInput.focus();
  }

  handleAbort = () => {
    if (this.controller) {
      this.controller.abort();
      this.enableInput();
      console.log("Request aborted");
    }
  }

  handleKeyPress = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      this.sendMessage();
    }
  }

  enableInput() {
    this.show(this.sendButton);
    this.hide(this.abortButton);
    this.enable(this.messageInput);
    this.messageInput.focus();
  }

  disableInput() {
    this.hide(this.sendButton);
    this.show(this.abortButton);
    this.disable(this.messageInput);
  }

  show = (element) => {
    element.style.display = 'block';
  }

  hide = (element) => {
    element.style.display = 'none';
  }

  enable = (element) => {
    element.removeAttribute('disabled');
  }

  disable = (element) => {
    element.setAttribute('disabled', 'disabled');
  }

  getModel = () => {
    return storage.get('model');
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    this.messageInput.value = '';
    if (message) {
      this.disableInput();
      const requestDiv = this.createMessageDiv(message, 'user');
      const responseDiv = this.createMessageDiv('', 'system');
      responseDiv.innerHTML = this.getSpinner();
      try {
        const data = { model: this.getModel(), prompt: message };
        const response = await this.postMessage(data, responseDiv);
        this.handleResponse(response, responseDiv);
      } catch (error) {
        this.updateResponse(responseDiv, `Error: ${error.message}`, 'system');
      }
    }
  }

  createMessageDiv = (text, sender) => {
    const div = document.createElement('div');
    div.classList.add('message', `${sender}-message`);
    div.textContent = text;
    div.initialResponse = true;
    this.chatHistory.appendChild(div);
    this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    return div;
  }

  getSpinner = () => {
    return '<div class="spinner"></div>';
  }

  async postMessage(data, responseDiv) {
    this.controller = new AbortController();
    const { signal } = this.controller;
    const response = await fetch(`${storage.get('url')}/api/generate`, {
      signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    this.handleHTTPError(response);
    return response;
  }

  handleHTTPError = (response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  async handleResponse(response, responseDiv) {
    const reader = response.body.getReader();
    let partialLine = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          this.handleDone();
          break;
        }

        const textChunk = new TextDecoder().decode(value);
        const lines = (partialLine + textChunk).split('\n');
        partialLine = lines.pop();

        lines.forEach(line => {
          if (line.trim()) {
            this.updateResponse(responseDiv, JSON.parse(line).response);
          }
        });
      }

      if (partialLine.trim()) {
        this.updateResponse(responseDiv, partialLine);
      }
    } catch (error) {
      this.handleResponseError(error, responseDiv);
    } finally {
      this.enableInput();
    }
  }

  handleResponseError = (error, responseDiv) => {
    if (error.name === 'AbortError') {
      console.log('Fetch aborted');
    } else {
      this.updateResponse(responseDiv, `Error: ${error.message}`, 'system');
    }
  }

  updateResponse = (div, content) => {
    const sanitizedContent = this.sanitizeContent(content);
    if (div.initialResponse) {
      div.innerHTML = sanitizedContent;
      div.initialResponse = false;
    } else {
      div.innerHTML += sanitizedContent;
    }
  }

  sanitizeContent = (content) => {
    // TODO: Sanitization logic here
    return content;
  }

  handleDone = () => {
    const chat = this.chats.getCurrentChat();
    const content = this.chatHistory.innerHTML;
    if (chat !== null) {
      this.chats.update(chat.id, chat.title, content);
    } else {
      this.chats.add('New chat', content);
    }
    this.chats.saveData()
  }

  getIdParam = () => {
    return new URL(window.location.href).pathname.split('/').pop();
  }
}