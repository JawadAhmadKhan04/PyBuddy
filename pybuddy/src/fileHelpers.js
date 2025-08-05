const vscode = require('vscode');

async function openFolderInExplorer(folderPath) {
	try {
		const uri = vscode.Uri.file(folderPath);
		await vscode.commands.executeCommand('vscode.openFolder', uri, false);
		vscode.window.showInformationMessage("Opening folder");
	} catch (err) {
		vscode.window.showErrorMessage('Could not open folder');
	}
}

module.exports = { openFolderInExplorer };
