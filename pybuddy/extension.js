// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "pybuddy" is now active!');

	const loginProvider = new LoginProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('pybuddy-login', loginProvider)
	);

	// Register the logout command for the title bar
	context.subscriptions.push(
		vscode.commands.registerCommand('pybuddy.logout', () => {
			vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', false);
			// Tell the webview to show the login button again
			if (loginProvider._webviewView) {
				loginProvider._webviewView.webview.postMessage({ type: 'showLogin' });
			}
		})
	);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('pybuddy.helloWorld', function () {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from PyBuddy!');
	});

	let selectedSpecificHints = [];

	// Load saved hints from globalState
	selectedSpecificHints = context.globalState.get('pybuddy.selectedSpecificHints', []);
	if (selectedSpecificHints.length > 0) {
		vscode.window.showInformationMessage(`Previously chosen specific hints: ${selectedSpecificHints.join(', ')}`);
	} else {
		vscode.window.showInformationMessage('No specific hints previously chosen.');
	}

	let showHints = vscode.commands.registerCommand('pybuddy.showHints', async function () {
		const specificHintOptions = [
			{ label: 'Option 1', picked: selectedSpecificHints.includes('Option 1') },
			{ label: 'Option 2', picked: selectedSpecificHints.includes('Option 2') },
			{ label: 'Option 3', picked: selectedSpecificHints.includes('Option 3') },
			{ label: 'Option 4', picked: selectedSpecificHints.includes('Option 4') },
			{ label: 'Option 5', picked: selectedSpecificHints.includes('Option 5') },
			{ label: 'Option 6', picked: selectedSpecificHints.includes('Option 6') },
			{ label: 'Option 7', picked: selectedSpecificHints.includes('Option 7') },
			{ label: 'Option 8', picked: selectedSpecificHints.includes('Option 8') },
			{ label: 'Option 9', picked: selectedSpecificHints.includes('Option 9') },
			{ label: 'Option 10', picked: selectedSpecificHints.includes('Option 10') }
		];

		const mainOptions = [
			{ label: 'General hints', description: 'Show general hints related to assignment' },
			{ label: 'Specific hints', description: 'Show the specific hints chosen' },
			{ label: 'Specific hints →', description: 'Choose Specific hints related to code' }
		];

		const mainPick = await vscode.window.showQuickPick(mainOptions, {
			placeHolder: 'Select a hint type',
			canPickMany: false
		});

		if (!mainPick) return;

		if (mainPick.label === 'General hints') {
			vscode.window.showInformationMessage('General hints clicked');
		} else if (mainPick.label === 'Specific hints') {
			vscode.window.showInformationMessage('Specific hints clicked');
		} else if (mainPick.label === 'Specific hints →') {
			vscode.window.showInformationMessage('Specific hints choose options clicked');
			const picked = await vscode.window.showQuickPick(specificHintOptions, {
				placeHolder: 'Select specific hint options',
				canPickMany: true
			});
			if (picked) {
				selectedSpecificHints = picked.map(option => option.label); // Save the chosen hints
				await context.globalState.update('pybuddy.selectedSpecificHints', selectedSpecificHints); // Persist across sessions
				picked.forEach(option => {
					vscode.window.showInformationMessage(`${option.label} is ${option.picked ? 'ON' : 'OFF'}`);
				});
			}
		}
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(showHints);
}

class LoginProvider {
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

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'login':
					vscode.window.showInformationMessage('Login Pressed');
					vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', true);
					// Hide the login button in the webview
					webviewView.webview.postMessage({ type: 'hideLogin' });
					break;
				case 'logout':
					vscode.window.showInformationMessage('Logout Pressed');
					vscode.commands.executeCommand('setContext', 'pybuddyLoggedIn', false);
					// Show the login button in the webview
					webviewView.webview.postMessage({ type: 'showLogin' });
					break;
			}
		});
	}

	_getHtmlForWebview(webview) {
		const webviewFolder = vscode.Uri.joinPath(this._extensionUri, 'webview');
		const htmlPath = vscode.Uri.joinPath(webviewFolder, 'login.html');
		const cssPath = vscode.Uri.joinPath(webviewFolder, 'login.css');
		const jsPath = vscode.Uri.joinPath(webviewFolder, 'login.js');

		let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
		const cssUri = webview.asWebviewUri(cssPath);
		const jsUri = webview.asWebviewUri(jsPath);

		html = html.replace('href="login.css"', `href="${cssUri}"`);
		html = html.replace('src="login.js"', `src="${jsUri}"`);

		return html;
	}
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
