prompt = """This is an assignment, I want to separate each question separately from the assignment, 
        and return the entire question in the asked format.
        If there are any for the entire assignment, then return the instructions for the entire assignment.
        
        For example, it could be the submission criteria, or if a specific topic for example "Recursion" is a must.
        Return the instructions in the asked format.
        
        Questions would always be starting with Q1, Q2, Q3 or like 'Question 1', 'Question 2', 'Question 3', etc.
        They can also start with 'Task 1', 'Task 2', 'Task 3', etc. or any synonym like 'Problem 1', 'Problem 2', 'Problem 3', etc.
        
        Each Questions can also contain sub-questions, you must not cater the sub-questions.
        If for instance you think there is a question but there is no heading, then it will not be considered as a question.
        If a new question is starting, it would specifically mention it.
        
        For example, if the text is:
        Question 1:
        Solve all of the following questions:
        1. Reverse a string
        2. Find the sum of two numbers
        
        Ignore any images, even if it lies inside a question. Instead of an image you should just return "IMAGE HERE".
        Then you should return that the entire question is as a single question"Question 1: Solve all of the following questions: 1. Reverse a string 2. Find the sum of two numbers".
        Make sure the questions are not overlapping with each other, and the questions are not repeated.
        Make sure the formatting of the questions is correct. For instance if inside a question, there is a new line, then the output should also has it as a new line.
        
        Do not at any cost duplicate the information of the questions.
        
        Lets take it step by step.
        """