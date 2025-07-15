
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { openFolderInExplorer } = require('./fileHelpers');

const backend_url = "http://127.0.0.1:8000";

// Global hint storage
let fileHints = {}; // { [filePath]: [hintMessage, ...] }
let currentFilePath = null;

function handleAddApiKey(context) {
    return async () => {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Gemini API Key',
            password: true, // Hide the input for security
            placeHolder: 'AIzaSyC...',
            validateInput: (input) => {
                if (!input || input.trim() === '') {
                    return 'API Key cannot be empty';
                }
                if (input.length < 10) {
                    return 'API Key seems too short';
                }
                return null; // Valid input
            }
        });

        if (apiKey) {
            // Store the API key in global state for persistence
            context.globalState.update('pybuddy.geminiApiKey', apiKey);

            // Send the API key to the backend
            try {
                const response = await fetch(`${backend_url}/add_api_key`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_key: apiKey })
                });
                if (!response.ok) {
                    throw new Error(`Backend returned status ${response.status}`);
                }
                const data = await response.json();
                vscode.window.showInformationMessage(data.message || 'API key sent to backend successfully!');
            } catch (error) {
                vscode.window.showErrorMessage('Failed to send API key to backend: ' + error.message);
            }
        }
    }
}

async function handleLoginFlow() {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Loading...',
            cancellable: false
        },
            async (progress) => {
            try {
                const file_path = "testing_pdfs/QuestCamp GCR assignment examples.pdf";
                // Extract the file name without extension
                const fileName = file_path.split('/').pop();  // "QuestCamp GCR assignment examples.pdf"
                const folder_name = fileName.substring(0, fileName.lastIndexOf('.'));
                console.log(folder_name); // Output: QuestCamp GCR assignment examples
                const file_creation_method = "Create files on auto"
                const endpoint = `${backend_url}/preprocessing_file`
                const requestBody = {
                    file_path: file_path,
                    folder_name: folder_name,
                    file_creation_method: file_creation_method
                }
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                });
                if (!response.ok) {
                    throw new Error(`Backend returned status ${response.status}`);
                }
                const data = await response.json();
                if (data.folder_path) {
                    vscode.window.showInformationMessage('Folder path: ' + data.folder_path);
                    await openFolderInExplorer(data.folder_path);
                } else if (data.error) {
                    vscode.window.showErrorMessage('Error: ' + data.error);
                } else {
                    vscode.window.showWarningMessage('Folder was created but no folder path was returned by the backend.');
                }
            } catch (error) {
                console.error('Error:', error);
                vscode.window.showErrorMessage(`Backend request failed: ${error.message}`);
            }
        }
    );
}

async function backendLogin() {
    try {
        const response = await fetch(`${backend_url}/login`, { method: 'POST' });
        const data = await response.json();
        vscode.window.showInformationMessage(data.message || 'Logged in!');
    } catch (error) {
        vscode.window.showErrorMessage('Login failed: ' + error.message);
    }
}

async function backendLogout() {
    try {
        const response = await fetch(`${backend_url}/logout`, { method: 'POST' });
        const data = await response.json();
        vscode.window.showInformationMessage(data.message || 'Logged out!');
    } catch (error) {
        vscode.window.showErrorMessage('Logout failed: ' + error.message);
    }
}

function handleShowHints(chatProvider) {
	return async function (customPath = null) {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			const filePath = activeEditor.document.uri.fsPath;
			currentFilePath = filePath;
			
			// Display existing hints for this file
			if (fileHints[filePath] && fileHints[filePath].length > 0) {
				if (chatProvider._webviewView) {
					// Clear existing messages and show stored hints
					chatProvider._webviewView.webview.postMessage({ 
						type: 'clearChat' 
					});
					
					// Send each stored hint
					for (const hint of fileHints[filePath]) {
						chatProvider._webviewView.webview.postMessage({ 
							type: 'hint', 
							content: hint 
						});
					}
				}
			} else {
				// Clear the chat panel when no hints are available
				if (chatProvider._webviewView) {
					chatProvider._webviewView.webview.postMessage({ 
						type: 'clearChat' 
					});
				}
			}
		} else {
			vscode.window.showInformationMessage("No active editor (no file is open).");
		}
	};
}

function handleGenerateHints(chatProvider) {
	return async function (customPath = null) {
		// your generateHintsForFile logic here...
        const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			currentFilePath = activeEditor.document.uri.fsPath;
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Generating hints...',
					cancellable: false
				},
				async (progress) => {
					const filePath = activeEditor.document.uri.fsPath;
					const folderPath = path.dirname(filePath);

					// Read all files in the folder and build codeDict
					let codeDict = {};
					const files = fs.readdirSync(folderPath);
					for (const file of files) {
						const fullPath = path.join(folderPath, file);
						if (fs.statSync(fullPath).isFile()) {
							codeDict[file] = fs.readFileSync(fullPath, 'utf-8');
						}
					}

					try {
						const endpoint = `${backend_url}/generate_hints`;
						const requestBody = { file_path: filePath, code_dict: codeDict };
						const response = await fetch(endpoint, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(requestBody)
						});
						if (!response.ok) {
							throw new Error(`Backend returned status ${response.status}`);
						}
						const data = await response.json();
						console.log(data.hint)

						if (data.error) {
							// if (chatProvider._webviewView) {
							//     chatProvider._webviewView.webview.postMessage({ 
							//         type: 'error', 
							//         content: data.error 
							//     });
							// }
							vscode.window.showErrorMessage("Error: API Key is Invalid. Either enter a valid API key or check if the API key is not expired.");
						} else if (data.hint) {
							// Send hint to chat interface
							let hintMessage;
							const pathParts = filePath.split('\\');
							const fileNameIndex = pathParts.findIndex(part => part.startsWith('question_'));
							if (fileNameIndex > 0) {
								const folderPathDisplay = pathParts.slice(fileNameIndex - 1, fileNameIndex + 1).join('\\');
								hintMessage = `💡 Hint for ${folderPathDisplay}\n\nTopic: ${data.hint.hint_topic}\n\n${data.hint.hint_text}`;
							} else {
								// Fallback to just the filename if path structure is different
								hintMessage = `💡 Hint for ${activeEditor.document.fileName.split('/').pop()}\n\nTopic: ${data.hint.hint_topic}\n\n${data.hint.hint_text}`;
							}
							// Store hint in fileHints
							if (!fileHints[currentFilePath]) {
								fileHints[currentFilePath] = [];
							}
							fileHints[currentFilePath].push(hintMessage);
							
							// Send hint to chat interface
							if (chatProvider._webviewView) {
								chatProvider._webviewView.webview.postMessage({ 
									type: 'hint', 
									content: hintMessage 
								});
							}
							vscode.window.showInformationMessage('Hint generated and sent to chat!');
						} else {
							vscode.window.showWarningMessage('No hint returned by backend.');
						}
					} catch (error) {
						vscode.window.showErrorMessage('Failed to generate hints: ' + error.message);
					}
				}
			);
		} else {
			vscode.window.showInformationMessage("No active editor (no file is open).");
		}
	};
}

function handleGenerateQuestions(questionProvider) {
	return async function (customPath = null) {
		// your generateQuestionsForFile logic here...
        const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Loading questions...',
					cancellable: false
				},
				async (progress) => {
					const filePath = activeEditor.document.uri.fsPath;
					try {
						const endpoint = `${backend_url}/get_question`;
						const requestBody = { file_path: filePath };
						const response = await fetch(endpoint, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(requestBody)
						});
						if (!response.ok) {
							throw new Error(`Backend returned status ${response.status}`);
						}
						const data = await response.json();
						console.log(data);

						if (data.question_text || data.instructions || data.links) {
							// Send question to question interface
							if (questionProvider._webviewView) {
								// Extract folder path from file path
								const pathParts = filePath.split('\\');
								const fileNameIndex = pathParts.findIndex(part => part.startsWith('question_'));
								if (fileNameIndex > 0) {
									const folderPath = pathParts.slice(fileNameIndex - 1, fileNameIndex + 1).join('\\');
									
									let questionMessage = `📋 Assignment: ${folderPath.replace("📋 Question for ", "").split("\\").slice(0, -1).join("\\")} - ${folderPath.split("\\").pop()}\n\n`;
									
									if (data.question_text) {
										questionMessage += `**Question:**\n${data.question_text}\n\n`;
									}
									
									if (data.instructions) {
										questionMessage += `**Instructions:**\n${data.instructions}`;
									}
									
									if (data.links) {
										questionMessage += `**Links:**\n${data.links}`;
									}
									
									questionProvider._webviewView.webview.postMessage({ 
										type: 'question', 
										content: questionMessage 
									});
								} else {
									// Fallback to just the filename if path structure is different
									let questionMessage = `📋 Question for ${activeEditor.document.fileName.split('/').pop()}\n\n`;
									
									if (data.question_text) {
										questionMessage += `**Question:**\n${data.question_text}\n\n`;
									}
									
									if (data.instructions) {
										questionMessage += `**Instructions:**\n${data.instructions}`;
									}
									
									questionProvider._webviewView.webview.postMessage({ 
										type: 'question', 
										content: questionMessage 
									});
								}
							}
							vscode.window.showInformationMessage('Question sent to questions panel!');
						} else {
							vscode.window.showWarningMessage('No question returned by backend.');
						}
					} catch (error) {
						vscode.window.showErrorMessage('Failed to generate questions: ' + error.message);
					}
				}
			);
		} else {
			vscode.window.showInformationMessage("No active editor (no file is open).");
		}
	};
}

module.exports = {
	handleLoginFlow,
	handleGenerateHints,
	handleShowHints,
	handleGenerateQuestions,
	handleAddApiKey,
    backendLogin,
    backendLogout
};
