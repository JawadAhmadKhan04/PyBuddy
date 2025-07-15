const vscode = require('vscode');

class ClassroomTreeItem extends vscode.TreeItem {
    constructor(label, collapsibleState, contextValue, nodeData, command, iconPath) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.nodeData = nodeData;
        if (command) this.command = command;
        if (iconPath) this.iconPath = iconPath;
    }
}

class ClassroomTreeProvider {
    constructor() {
        this.isLoggedIn = false;
        this.data = [];
        this.isLoading = false;
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

    setLoading(isLoading) {
        this.isLoading = isLoading;
        this.refresh();
    }

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        // Loading state: show spinner
        if (this.isLoading && !element) {
            return [
                new ClassroomTreeItem(
                    'Loading Google Classroom data...',
                    vscode.TreeItemCollapsibleState.None,
                    'loading',
                    null,
                    undefined,
                    new vscode.ThemeIcon('loading~spin')
                )
            ];
        }
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
                new ClassroomTreeItem(
                    child.label,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    child.label === 'Assignments' ? 'assignments' : child.label.toLowerCase(),
                    child
                )
            );
        }
        // Assignment titles (leaf nodes under 'Assignments')
        if (element.contextValue === 'assignments') {
            return element.nodeData.children.map(child =>
                new ClassroomTreeItem(
                    child.label,
                    vscode.TreeItemCollapsibleState.None,
                    'assignment-title',
                    child,
                    {
                        command: 'pybuddy.showAssignmentDescription',
                        title: 'Show Assignment Description',
                        arguments: [child]
                    }
                )
            );
        }
        // Leaf nodes (fallback)
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