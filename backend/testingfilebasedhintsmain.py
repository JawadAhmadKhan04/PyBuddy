from file_based_hints import FileBasedHints

hinter = FileBasedHints()
# hinter.execute_preprocessing("testing_pdfs/Assignment01.pdf", "test3")
print(hinter.get_general_hints("", "test3", 3))

