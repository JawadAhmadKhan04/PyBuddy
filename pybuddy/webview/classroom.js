// classroom.js
// Explorer-like collapsible tree for Google Classroom

const mockData = [
  {
    id: 'course1',
    label: 'Mathematics 101',
    children: [
      {
        id: 'course1-assignments',
        label: 'Assignments',
        children: [
          { id: 'course1-assignment1', label: 'Assignment 1: Algebra' },
          { id: 'course1-assignment2', label: 'Assignment 2: Calculus' }
        ]
      },
      {
        id: 'course1-resources',
        label: 'Resources',
        children: [
          { id: 'course1-resource1', label: 'Syllabus.pdf' },
          { id: 'course1-resource2', label: 'Lecture Notes Week 1' }
        ]
      },
      {
        id: 'course1-people',
        label: 'People',
        children: [
          { id: 'course1-teacher', label: 'Alice Johnson (Teacher)' },
          { id: 'course1-student', label: 'Bob Smith (Student)' }
        ]
      }
    ]
  },
  {
    id: 'course2',
    label: 'Physics 202',
    children: [
      {
        id: 'course2-assignments',
        label: 'Assignments',
        children: [
          { id: 'course2-assignment1', label: 'Assignment 1: Kinematics' }
        ]
      },
      {
        id: 'course2-resources',
        label: 'Resources',
        children: [
          { id: 'course2-resource1', label: 'Lab Manual.pdf' }
        ]
      },
      {
        id: 'course2-people',
        label: 'People',
        children: [
          { id: 'course2-teacher', label: 'Dr. Brown (Teacher)' }
        ]
      }
    ]
  }
];

const treeContainer = document.getElementById('gcr-tree');
let selectedNodeId = null;

function renderTree(data, parentEl) {
  data.forEach(node => {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'gcr-tree-node';
    nodeEl.dataset.nodeId = node.id;
    if (node.id === selectedNodeId) nodeEl.classList.add('selected');

    // Expand/collapse toggle
    if (node.children && node.children.length > 0) {
      const toggle = document.createElement('span');
      toggle.className = 'gcr-tree-toggle';
      nodeEl.appendChild(toggle);
      nodeEl.classList.add('collapsed');
      toggle.onclick = e => {
        e.stopPropagation();
        nodeEl.classList.toggle('expanded');
        nodeEl.classList.toggle('collapsed');
        childrenEl.style.display = nodeEl.classList.contains('expanded') ? '' : 'none';
      };
    }

    // Label
    const label = document.createElement('span');
    label.className = 'gcr-tree-label';
    label.textContent = node.label;
    nodeEl.appendChild(label);

    // Select node
    nodeEl.onclick = e => {
      e.stopPropagation();
      document.querySelectorAll('.gcr-tree-node.selected').forEach(el => el.classList.remove('selected'));
      nodeEl.classList.add('selected');
      selectedNodeId = node.id;
      // You can add logic here to show details for the selected node
    };

    parentEl.appendChild(nodeEl);

    // Children
    if (node.children && node.children.length > 0) {
      const childrenEl = document.createElement('div');
      childrenEl.className = 'gcr-tree-children';
      childrenEl.style.display = 'none';
      renderTree(node.children, childrenEl);
      nodeEl.appendChild(childrenEl);
    }
  });
}

treeContainer.innerHTML = '';
renderTree(mockData, treeContainer); 