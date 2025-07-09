import os

def create_files(folder_name: str, total_questions: int) -> None:
    cwd = os.getcwd()
    parent_dir = os.path.dirname(cwd)

    folder_path = os.path.join(parent_dir, folder_name)
    os.makedirs(folder_path, exist_ok=True)
    print("Current Working Directory:", folder_path)
    for i in range(total_questions):
        file_path = os.path.join(folder_path, f"question_{i+1}.py")
        with open(file_path, "w") as f:
            f.write(f"# This is question {i+1}")

create_files("test3", 4)