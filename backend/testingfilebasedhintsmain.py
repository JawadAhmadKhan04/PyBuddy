from file_based_hints import FileBasedHints

hinter = FileBasedHints()
# hinter.execute_preprocessing("testing_pdfs/Assignment01.pdf", "test2")
print(hinter.get_general_hints("test", 3))

