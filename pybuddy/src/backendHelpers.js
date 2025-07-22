
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { openFolderInExplorer } = require('./fileHelpers');
const { globalTokenJson } = require('./activate');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const http = require('http');
const { URL } = require('url');

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
            // context.globalState.update('pybuddy.geminiApiKey', apiKey);

            // Send the API key to the backend
            try {
                const response = await fetch(`${backend_url}/add_api_key`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_key: apiKey, username: context.globalState.get('pybuddy.username') })
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

async function backendLogout(tokenJson = globalTokenJson) {
    try {
        const response = await fetch(`${backend_url}/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ info: tokenJson })
        });
        const data = await response.json();
        vscode.window.showInformationMessage(data.message || 'Logged out!');
        // Delete token.json after successful logout
        try {
            const tokenPath = path.join(__dirname, 'token.json');
            if (fs.existsSync(tokenPath)) {
                fs.unlinkSync(tokenPath);
                console.log('token.json deleted after logout');
            }
            // Clear the global variable as well
            const activate = require('./activate');
            activate.globalTokenJson = '';
        } catch (deleteErr) {
            console.warn('Failed to delete token.json after logout:', deleteErr.message);
            vscode.window.showWarningMessage('Failed to delete token.json after logout.');
        }
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

function handleGenerateHints(chatProvider, context) {
	return async function (description = null) {
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
						console.log(description);
						const requestBody = {
							code_dict: codeDict,
							question_data: description || '',
							username: context.globalState.get('pybuddy.username', '')
						};
						console.log(requestBody);
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
							vscode.window.showErrorMessage("Error: API Key is Invalid. Either enter a valid API key or check if the API key is not expired.");
						}
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

/**
 * Fetches Google Classroom data from the backend.
 * @returns {Promise<Array>} The gcr_data array from the backend, or [] on error.
 */
async function fetchGCRData(tokenJson = globalTokenJson) {
    try {
        const response = await fetch(`${backend_url}/get_gcr_data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ info: tokenJson })
        });
        if (!response.ok) {
            throw new Error(`Backend returned status ${response.status}`);
        }
        const data = await response.json();
        return data.gcr_data || [];
    } catch (error) {
        vscode.window.showErrorMessage('Failed to fetch Google Classroom data: ' + error.message);
        return [];
    }
}

/**
 * Submits assignment code files to the backend for GitHub push.
 * @param {Object} params - { github_username, github_token, repo_name, course_id, assignment_id, code_files }
 * @returns {Promise<Object>} - { github_link } or { error }
 */
async function submitAssignmentToGithub(params) {
    try {
        const response = await fetch(`${backend_url}/submit/github`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Backend returned status ${response.status}`);
        }
        return data;
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * Sends GitHub credentials to the backend to be saved in the database.
 * @param {Object} params - { github_username, github_token, username }
 * @returns {Promise<Object>} - { message } or { error }
 */
async function saveGithubCredentialsToBackend(params) {
    try {
        // Ensure correct keys for backend
        const body = {
            username: params.username,
            github_name: params.github_name || params.github_username || '',
            github_token: params.github_token || ''
        };
        const response = await fetch(`${backend_url}/add_github`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Backend returned status ${response.status}`);
        }
        return data;
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * Deletes GitHub credentials for a user in the backend.
 * @param {string} username
 * @returns {Promise<Object>} - { message } or { error }
 */
async function deleteGithubCredentialsFromBackend(username) {
    try {
        const response = await fetch(`${backend_url}/delete_github`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Backend returned status ${response.status}`);
        }
        return data;
    } catch (error) {
        return { error: error.message };
    }
}

// Fetch the username from the backend
async function getUserName(tokenJson = globalTokenJson) {
    try {
        const response = await fetch(`${backend_url}/get_user_name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ info: tokenJson })
        });
        if (response.ok) {
            const data = await response.json();
            return data.user_name;
        }
    } catch (err) {
        // Optionally log error
    }
    return 'user';
}

function formatToken(tokens, clientId, clientSecret) {
    return {
        token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_uri: "https://oauth2.googleapis.com/token",
        client_id: clientId,
        client_secret: clientSecret,
        scopes: tokens.scope ? tokens.scope.split(" ") : [],
        universe_domain: "googleapis.com",
        account: "",
        expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined
    };
}

async function loginWithGoogle() {
    const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
    const TOKEN_PATH = path.join(__dirname, 'token.json');
    const SCOPES = [
        "https://www.googleapis.com/auth/classroom.courses.readonly",
            "https://www.googleapis.com/auth/classroom.rosters.readonly",
            "https://www.googleapis.com/auth/classroom.coursework.me",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/classroom.coursework.students"
    ];

    let credentials;
    if (fs.existsSync(CREDENTIALS_PATH)) {
        credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    } else {
        throw new Error('credentials.json not found.');
    }
    const { client_id, client_secret } = credentials.installed;

    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:5000/callback');

    // Check if token already exists
    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oAuth2Client.setCredentials(token);
        // Always return the formatted token
        return formatToken(token, client_id, client_secret);
    }

    // Generate the auth URL
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent select_account',
    });
    vscode.env.openExternal(vscode.Uri.parse(authUrl));

    const token = await new Promise((resolve, reject) => {
        const server = require('http').createServer(async (req, res) => {
            if (req.url.startsWith('/callback')) {
                const query = new URL(req.url, 'http://localhost:5000').searchParams;
                const code = query.get('code');
                res.end('Authentication successful! You may now close this tab.');
                server.close();

                try {
                    const { tokens } = await oAuth2Client.getToken(code);
                    oAuth2Client.setCredentials(tokens);
                    resolve(tokens);
                } catch (err) {
                    reject(err);
                }
            }
        }).listen(5000);
    });

    const formattedToken = formatToken(token, client_id, client_secret);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(formattedToken));
    console.log(formattedToken);
    return formattedToken;
}


// async function loginWithGoogle() {
//     // These values should match your credentials.json
//     const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // Force manual code flow
//     const SCOPES = [
//         'https://www.googleapis.com/auth/classroom.courses.readonly',
//         'https://www.googleapis.com/auth/classroom.rosters',
//         'https://www.googleapis.com/auth/classroom.coursework.me'
//     ];
//     const TOKEN_PATH = path.join(__dirname, 'token.json');
//     const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

//     let credentials;
//     if (fs.existsSync(CREDENTIALS_PATH)) {
//         credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
//     } else {
//         throw new Error('credentials.json not found.');
//     }
//     const { client_id, client_secret } = credentials.installed;
//     // Always use the manual redirect URI
//     const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

//     // Check if token already exists
//     if (fs.existsSync(TOKEN_PATH)) {
//         const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
//         oAuth2Client.setCredentials(token);
//         return token;
//     }

//     // Generate the auth URL
//     const authUrl = oAuth2Client.generateAuthUrl({
//         access_type: 'offline',
//         scope: SCOPES,
//         prompt: 'consent',
//     });
//     vscode.env.openExternal(vscode.Uri.parse(authUrl));
//     const code = await vscode.window.showInputBox({
//         prompt: 'Enter the code from Google after login',
//         ignoreFocusOut: true
//     });
//     if (!code) throw new Error('No code entered.');
//     const { tokens } = await oAuth2Client.getToken(code);
//     oAuth2Client.setCredentials(tokens);
//     // Add client_id and client_secret to the token object
//     tokens.client_id = client_id;
//     tokens.client_secret = client_secret;
//     const formattedToken = formatToken(tokens, client_id, client_secret);
//     fs.writeFileSync(TOKEN_PATH, JSON.stringify(formattedToken));
//     console.log(formattedToken);
//     return formattedToken;
// }

module.exports = {
	handleLoginFlow,
	handleGenerateHints,
	handleShowHints,
	handleGenerateQuestions,
	handleAddApiKey,
    backendLogout,
    fetchGCRData,
    getUserName,
    submitAssignmentToGithub,
    loginWithGoogle,
    saveGithubCredentialsToBackend,
    deleteGithubCredentialsFromBackend
};
