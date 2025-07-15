const vscode = require('vscode');
const fs = require('fs');

class ClassroomProvider {
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this._webviewView = null;
    }

    resolveWebviewView(webviewView) {
        this._webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview')]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // You can add message handling here if needed
        webviewView.webview.onDidReceiveMessage(async data => {
            // Handle messages from classroom.js if needed
        });
    }

    _getHtmlForWebview(webview) {
        const webviewFolder = vscode.Uri.joinPath(this._extensionUri, 'webview');
        const htmlPath = vscode.Uri.joinPath(webviewFolder, 'classroom.html');
        const cssPath = vscode.Uri.joinPath(webviewFolder, 'classroom.css');
        const jsPath = vscode.Uri.joinPath(webviewFolder, 'classroom.js');

        let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
        const cssUri = webview.asWebviewUri(cssPath);
        const jsUri = webview.asWebviewUri(jsPath);

        html = html.replace('href="classroom.css"', `href="${cssUri}"`);
        html = html.replace('src="classroom.js"', `src="${jsUri}"`);

        return html;
    }
}

module.exports = ClassroomProvider; 