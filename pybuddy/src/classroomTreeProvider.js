const vscode = require('vscode');

class ClassroomTreeItem extends vscode.TreeItem {
    constructor(label, collapsibleState, contextValue, nodeData, command) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.nodeData = nodeData;
        if (command) this.command = command;
    }
}

class ClassroomTreeProvider {
    constructor() {
        this.isLoggedIn = false;
        this.data = [];
        this._onDidChangeTreeData = new vscode.EventEmitter();
    }

    setLoggedIn(isLoggedIn) {
        this.isLoggedIn = isLoggedIn;
        this.refresh();
    }

    setData(data) {
        this.data = data;
        this.refresh();
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        // Top level: only show classroom data or login prompt, not login/logout item
        if (!element) {
            if (!this.isLoggedIn) {
                // Show login prompt
                return [
                    new ClassroomTreeItem('Please log in to view your Google Classroom', vscode.TreeItemCollapsibleState.None, 'not-logged-in')
                ];
            } else {
                // Show classroom data
                return this.data.map(course =>
                    new ClassroomTreeItem(course.label, vscode.TreeItemCollapsibleState.Collapsed, 'course', course)
                );
            }
        }
        // Children: assignments/resources/people
        if (element.contextValue === 'course') {
            return element.nodeData.children.map(child =>
                new ClassroomTreeItem(child.label, vscode.TreeItemCollapsibleState.Collapsed, child.label.toLowerCase(), child)
            );
        }
        // Leaf nodes
        if (element.nodeData && element.nodeData.children) {
            return element.nodeData.children.map(child =>
                new ClassroomTreeItem(child.label, vscode.TreeItemCollapsibleState.None, 'item', child)
            );
        }
        return [];
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    get onDidChangeTreeData() {
        return this._onDidChangeTreeData.event;
    }
}

module.exports = ClassroomTreeProvider; 