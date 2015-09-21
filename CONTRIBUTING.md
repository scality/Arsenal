# Contributing to the Project

This document contains and defines the rules that have to be followed by any
contributor to the project, in order for any change to be merged into the
stable branches.

## Workflow

To Be Defined.

## Coding Style Guidelines

This Coding Style guidelines exist for one simple reason: working together.
This means that by following those, the different contributors will naturally
follow a common style, making the project unified in this aspect. This will
prove to be a good way to minimize the time waste due to trying to read and
understand a code with completely different standards.

If any rule seems out-of-bounds, any contributor is welcome to discuss it, as
long as he/she follows the rules set for the project. A configuration file for
JSHint shall accompany this Coding Style Guidelines in order to help enforce
as much as possible of it.

### Code Commentary and documentation
 - API Functions must be preceded by a small doxygen/jsdoc-formatted explanatory
   comment: What is the role of the function, what are the parameters, what are
   the possible return values, and whether it can throw exceptions
 - Internal function shall (if the developer or reviewer deems it deserving,
   due to a inherent complexity) be preceded by a jsdoc-formatted explanatory
   comment, similarly to API functions
 - For complex parts of the code, add a comment block before, explaining the
   WHY, the HOW, and the WHAT FOR
 - Avoid paraphrasing the code through the comments, as it is not useful and
   generates noise for code reading (reviews included)
 - Avoid one-liner comments as they can easily get out of-sync from the code

### Naming conventions
 - Class names and types shall be written in CamelCase (i.e.: the
   valid form of a type named 'mechanic cow' is 'MechanicCow')
 - Variables and function/method names shall be written in snake_case (i.e.: a
   variable containing a "client array" could be called "client_array")
 - Every identifier (variable/function/method names) shall bear semantically
   correct names: for instance, booleans shall have their names starting by
   'is_' to describe the intent of a boolean test. Those names shall help the
   reader understand the intent and use of the said variable.

### Syntax Rules
####  Indentation
    - Indentation is made of spaces, with 4 spaces by levels of indentation.
    - Blocks open at the same line of the associated construct (function, if,
      while, etc...), preceded by a space, and the closing brace shall be alone
      on a line.
    - One-line blocks making up the body of a conditional construct such as a
      'if' must be written with braces to explicit the scope, as it was proven
      with time that it can lead to subtle programming errors than can be hard
      to catch
    - Lines must be no longer than 80 columns, for readability and clarity
      purposes.

####  Advised Practices
   - Line length is not explicitly limited, but should be kept as short as
     possible, in order to make the code easier to read and quickly
     understandable
   - The keywords shall be followed by one space (function, if, switch,
     forEach, etc...)
   - The operators shall be wrapped in spaces (i.e.: 'i=1;' is invalid,
     'i = 1;' is valid)
   - For clarity and safety, avoid post/pre operators (i++, ++i, i--, --i,
     etc.), and prefer the use of the form '+=' or '-=';
   - For consistency, prefer using simple quotes to use strings in the code
   - Prefer the use of the semantically correct construct when given the choice
     (for instance in JS, prefer using forEach when iterating an array, rather
      than a simple for).

####  Forbidden practices
   - Never throw an un-caught exception from a callback
   - Never use exceptions without an Object of the appropriate type
     (std::Exception for C++, Error for JS, etc.)

### NodeJS Specifics

#### Advised practices
   - Variable and constant declarations:
     - For const values declarations, prefer the use of the keyword 'const'
       over 'let' or 'var', to force the constness of a value, and prevent the
       post-declaration of this given value.
     - For variable declarations, prefere the use of the keyword 'let' over
       'var', to prevent the declaration of a variable after its use.
   - Prefer the use of forEach to iterate over an array of elements
   - Favor exceptions for error management within synchronous code (i.e.: as
     long as the error does not unwind higher than the called callback itself).
   - When using the 'for..in' loop construct, wrap the body with a check of the
     property: 'if (obj.hasOwnProperty(propname)) { ...body here... }'

####  Forbidden practices
   - Use of '==' is forbidden, as it may be a headache worthy cause of
     unexpected behaviors. Use '===' instead, as it is less confusing with '='
     than '=='.
