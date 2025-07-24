// Chat functionality for PyBuddy hints
const vscode = acquireVsCodeApi();

class ChatInterface {
    constructor() {
        this.messages = [];
        this.isTyping = false;
        this.init();
    }

    init() {
        this.chatMessages = document.getElementById('chatMessages');

        this.setupEventListeners();
        this.loadMessages();
    }

    setupEventListeners() {
        // Listen for messages from the extension
        window.addEventListener('message', (event) => {
            const message = event.data;
            this.handleExtensionMessage(message);
        });
    }



    addMessage(content, sender, isHint = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // If this is a structured hint object, render with collapsible concepts
        if (isHint && typeof content === 'object' && content.assignment && content.topic && content.text) {
            let html = `<b>💡 Hint for ${content.assignment}</b><br><br>`;
            html += `<b>Topic:</b> ${content.topic}<br><br>`;
            html += `${content.text}<br>`;
            if (content.concepts && Object.keys(content.concepts).length > 0) {
                html += `<div class="concepts-list"><b>Concepts:</b><br>`;
                let idx = 0;
                for (const [conceptName, conceptDesc] of Object.entries(content.concepts)) {
                    html += `
                        <div class="concept-item">
                            <div class="concept-title" data-idx="${idx}">${conceptName}</div>
                            <div class="concept-desc" id="concept-desc-${idx}" style="display:none;">${conceptDesc}</div>
                        </div>
                    `;
                    idx++;
                }
                html += `</div>`;
            }
            messageContent.innerHTML = html;
        } else {
            // Format the content (handle code blocks, line breaks, etc.)
            const formattedContent = this.formatMessage(content, isHint);
            messageContent.innerHTML = formattedContent;
        }
        
        messageDiv.appendChild(messageContent);
        this.chatMessages.appendChild(messageDiv);
        
        // Add expand/collapse logic for concepts (if present)
        if (isHint && typeof content === 'object' && content.concepts && Object.keys(content.concepts).length > 0) {
            const conceptTitles = messageContent.querySelectorAll('.concept-title');
            conceptTitles.forEach(title => {
                title.addEventListener('click', () => {
                    const idx = title.getAttribute('data-idx');
                    const desc = messageContent.querySelector(`#concept-desc-${idx}`);
                    const isOpen = desc && desc.style.display !== 'none';
                    // Collapse all others in this message
                    conceptTitles.forEach(other => {
                        const otherIdx = other.getAttribute('data-idx');
                        const otherDesc = messageContent.querySelector(`#concept-desc-${otherIdx}`);
                        if (otherDesc) otherDesc.style.display = 'none';
                    });
                    // Toggle this one
                    if (desc) desc.style.display = isOpen ? 'none' : 'block';
                });
            });
        }
        
        // Store message
        this.messages.push({
            content: content,
            sender: sender,
            timestamp: new Date().toISOString(),
            isHint: isHint
        });
        
        // Scroll to bottom
        this.scrollToBottom();
        
        // Save messages
        this.saveMessages();

        // If this is the last hint message, add the 'Hint' button at the bottom
        if (isHint) {
            // Remove any existing hint button
            const oldBtn = document.getElementById('request-hint-btn');
            if (oldBtn) oldBtn.remove();
            // Add the button only after the last hint
            setTimeout(() => {
                if (this.chatMessages.lastChild === messageDiv) {
                    const btn = document.createElement('button');
                    btn.id = 'request-hint-btn';
                    btn.textContent = 'Hint';
                    btn.className = 'request-hint-btn';
                    btn.onclick = () => {
                        vscode.postMessage({ type: 'requestHint' });
                    };
                    this.chatMessages.appendChild(btn);
                    this.scrollToBottom();
                }
            }, 0);
        }
    }

    formatMessage(content, isHint = false) {
        // Convert plain text to HTML with proper formatting
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        // Convert line breaks to <br> tags
        formatted = formatted.replace(/\n/g, '<br>');

        // Convert code blocks (text between backticks)
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Convert multi-line code blocks (text between triple backticks)
        formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        // Wrap in paragraphs
        formatted = formatted.split('<br>').map(line => `<p>${line}</p>`).join('');

        return formatted;
    }

    showTypingIndicator() {
        if (this.isTyping) return;
        
        this.isTyping = true;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot-message typing-indicator';
        typingDiv.id = 'typingIndicator';
        
        typingDiv.innerHTML = `
            <div class="message-content">
                <span>PyBuddy is thinking</span>
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        
        this.chatMessages.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        this.isTyping = false;
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    handleExtensionMessage(message) {
        switch (message.type) {
            case 'hint':
                this.hideTypingIndicator();
                this.addMessage(message.content, 'bot', true);
                break;
            case 'error':
                this.hideTypingIndicator();
                this.addMessage(`❌ Error: ${message.content}`, 'bot');
                break;
            case 'clearChat':
                this.clearChat();
                break;
            case 'loadMessages':
                this.loadSavedMessages(message.messages);
                break;
        }
    }

    clearChat() {
        // Keep only the welcome message
        const welcomeMessage = this.chatMessages.querySelector('.welcome-message');
        this.chatMessages.innerHTML = '';
        if (welcomeMessage) {
            this.chatMessages.appendChild(welcomeMessage);
        }
        
        this.messages = [];
        this.saveMessages();
        
        // Notify extension
        vscode.postMessage({
            type: 'chatCleared'
        });
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    saveMessages() {
        // Save messages to extension state
        vscode.postMessage({
            type: 'saveMessages',
            messages: this.messages
        });
    }

    loadMessages() {
        // Request saved messages from extension
        vscode.postMessage({
            type: 'loadMessages'
        });
    }

    loadSavedMessages(savedMessages) {
        if (savedMessages && savedMessages.length > 0) {
            // Clear existing messages except welcome
            const welcomeMessage = this.chatMessages.querySelector('.welcome-message');
            this.chatMessages.innerHTML = '';
            if (welcomeMessage) {
                this.chatMessages.appendChild(welcomeMessage);
            }

            // Load saved messages
            savedMessages.forEach(msg => {
                this.addMessage(msg.content, msg.sender, msg.isHint);
            });

            this.messages = savedMessages;
        }
    }
}

// Initialize chat interface when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatInterface();
}); 