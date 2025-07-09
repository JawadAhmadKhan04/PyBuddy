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
        
        // Format the content (handle code blocks, line breaks, etc.)
        const formattedContent = this.formatMessage(content, isHint);
        messageContent.innerHTML = formattedContent;
        
        messageDiv.appendChild(messageContent);
        this.chatMessages.appendChild(messageDiv);
        
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