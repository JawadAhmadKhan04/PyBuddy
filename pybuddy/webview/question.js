// Question functionality for PyBuddy
const vscode = acquireVsCodeApi();

class QuestionInterface {
    constructor() {
        this.questions = [];
        this.init();
    }

    init() {
        this.questionMessages = document.getElementById('questionMessages');
        this.setupEventListeners();
        this.loadQuestions();
    }

    setupEventListeners() {
        // Listen for messages from the extension
        window.addEventListener('message', (event) => {
            const message = event.data;
            this.handleExtensionMessage(message);
        });
    }

    addQuestion(content, isQuestion = false) {
        // Clear everything including welcome message
        this.questionMessages.innerHTML = '';
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // Format the content (handle code blocks, line breaks, etc.)
        const formattedContent = this.formatQuestion(content, isQuestion);
        messageContent.innerHTML = formattedContent;
        
        messageDiv.appendChild(messageContent);
        this.questionMessages.appendChild(messageDiv);
        
        // Store only the current question
        this.questions = [{
            content: content,
            timestamp: new Date().toISOString(),
            isQuestion: isQuestion
        }];
        
        // Scroll to bottom
        this.scrollToBottom();
        
        // Save questions
        this.saveQuestions();
    }

    formatQuestion(content, isQuestion = false) {
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

        // Convert markdown headers
        formatted = formatted.replace(/### (.*?)(<br>|$)/g, '<h3>$1</h3>');
        formatted = formatted.replace(/## (.*?)(<br>|$)/g, '<h4>$1</h4>');

        // Convert bullet points
        formatted = formatted.replace(/^\* (.*?)(<br>|$)/gm, '<li>$1</li>');
        formatted = formatted.replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>');

        // Convert numbered lists
        formatted = formatted.replace(/^\d+\. (.*?)(<br>|$)/gm, '<li>$1</li>');
        formatted = formatted.replace(/(<li>.*?<\/li>)/s, '<ol>$1</ol>');

        // Wrap in paragraphs
        formatted = formatted.split('<br>').map(line => {
            if (line.startsWith('<h3>') || line.startsWith('<h4>') || line.startsWith('<ul>') || line.startsWith('<ol>') || line.startsWith('<pre>')) {
                return line;
            }
            return `<p>${line}</p>`;
        }).join('');

        return formatted;
    }

    handleExtensionMessage(message) {
        switch (message.type) {
            case 'question':
                this.addQuestion(message.content, true);
                break;
            case 'error':
                this.addQuestion(`❌ Error: ${message.content}`, false);
                break;
            case 'clearQuestions':
                this.clearQuestions();
                break;
            case 'loadQuestions':
                this.loadSavedQuestions(message.questions);
                break;
        }
    }

    clearQuestions() {
        // Clear everything and show welcome message
        this.questionMessages.innerHTML = '';
        
        // Add welcome message back
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-message';
        welcomeDiv.innerHTML = `
            <div class="message bot-message">
                <div class="message-content">
                    <p>📋 Welcome to PyBuddy Questions!</p>
                    <p>Open a Python file and click the questions button to see the question and instructions here.</p>
                </div>
            </div>
        `;
        this.questionMessages.appendChild(welcomeDiv);
        
        this.questions = [];
        this.saveQuestions();
        
        // Notify extension
        vscode.postMessage({
            type: 'questionsCleared'
        });
    }

    scrollToBottom() {
        this.questionMessages.scrollTop = this.questionMessages.scrollHeight;
    }

    saveQuestions() {
        // Save questions to extension state
        vscode.postMessage({
            type: 'saveQuestions',
            questions: this.questions
        });
    }

    loadQuestions() {
        // Request saved questions from extension
        vscode.postMessage({
            type: 'loadQuestions'
        });
    }

    loadSavedQuestions(savedQuestions) {
        if (savedQuestions && savedQuestions.length > 0) {
            // Load the most recent question
            const latestQuestion = savedQuestions[savedQuestions.length - 1];
            this.addQuestion(latestQuestion.content, latestQuestion.isQuestion);
        } else {
            // Show welcome message if no questions
            this.questionMessages.innerHTML = '';
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'welcome-message';
            welcomeDiv.innerHTML = `
                <div class="message bot-message">
                    <div class="message-content">
                        <p>📋 Welcome to PyBuddy Questions!</p>
                        <p>Open a Python file and click the questions button to see the question and instructions here.</p>
                    </div>
                </div>
            `;
            this.questionMessages.appendChild(welcomeDiv);
        }
    }
}

// Initialize question interface when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new QuestionInterface();
}); 