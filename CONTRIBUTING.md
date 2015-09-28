Contributing to the Project
===========================

This document contains and defines the rules that have to be followed by any
contributor to the project, in order for any change to be merged into the
stable branches.

Workflow
========

The worklow we define here has multiple purposes, and this document will go
over what rule is here to ensure each of these purposes:
 * Define one and only one path to add code into the codebase
 * Allow the maintenance of multiple releases at the same time
 * Work efficiently as a team
 * Streamline all the development in one rolling-release branch

First, have a cookie, and look at this magnificient ASCII workflow
representation. It should help you identify how contributions are made, where
and what does the code pass through, and how we maintain releases.

```ascii
   WIP Branches         master        Release Branches
                   |      |
                   |      |
                   |      X
         /dev/FT/color  / |
        +--------------+  |
        |          |      |
        |          +---+  |
        X               \ |
        |                 X
        X /dev/BF/flow  / |
    +---|--------------+  |
    |   X                 |
    X   |  Pull Request   |
    |   +--------------+  |
    X  code review + CI \ |
    |     -> merge PR     X
    |                     | \   /rel/1.0
    X                     |  +-------------+
    |    Pull Request     |                |
    +------------------+  |                |
      code review + CI  \ |                |
                          X----------------X # Bump version to 1.0.1
                          | cherry-pick -x |
                          |                |
                          |                |
                          v                v
```

As you can see, we have three main types of branches, each with a specific
responsibility and its specific rules.

## Restrictions of the master branch

The master branch is a very specific branch in our workflow. No commit must
ever go directly into the master branch, and the code shall follow one and only
one path to get into the master branch.

## Coding for the project

### Branching Guidelines

In order to work on the Project, any contributor will be asked to create
separate branches for each task. Theses branches are part of the "Work In
Progress" aka `WIP` branches. A contributor must thus create a branch, that he
can push into the project's repository. He can then start working, and commit
following the [guidelines](#committing-guidelines).

The branch name shall follow a very concise naming scheme, in order for an
**automatic CI system to be able to start builds on every development branch**:
```
/dev/tag/name
```

The `WIP` branch name must start by `/dev/`, followed by a `tag` defined to
describe the type of task the branch is associated with, then followed by a
self-explanatory `name` for the branch. The following Tags are currently allowed:
 * FT: Feature branch
 * BF: Bugfix branch
 * HF: Hotfix branch (fundamentaly an emergency Bugfix branch)
 * DOC: Documentation branch
 * CLEANUP: Code Cleanup/Refactoring branch
 * ...

For instance, if contributor A was going to work on the feature adding
squeaking sounds to his favourite VCS, he could name his branch:
```
/dev/FT/SqueakOnPush
```
This would mean that it is a working branch for a Feature called "Squeak On
Push".

When the contributor's work (feature/bugfix/hotfix) is complete, he can create
a pull request from his branch into the master branch. Then, the code merging
process described in [Merging code into the
master](#merging-code-into-the-master) starts.


### Committing Guidelines

With his own `WIP` branch, contributor A can now manage the branch's history as
he wishes, as the branch is his own responsibility, within the constraints of
the project. These constraints include:
 * [Coding Style Guidelines](#coding-style-guidelines)
 * Commit Message Formatting Policy
 * Peer validation of the commit's atomicity and meaningfulness

It is asked of every contributor to provide commit messages as clear as
possible, while attempting to make one commit comply to the following
conditions:
 * Provide one and only one feature/bugfix/meaningful change
 * Provide working unit and functional tests associated to the change.

The commit message shall follow a **standardized formatting, that will be checked
automatically by a VCS hook on the commit**.

The first line of the commit message (often called the one-liner) shall provide
the essential information about the commit itself. It must thus provide a tag
describing the type of development task accomplished and a short imperative
sentence to describe the essence of the commit. Then, if more details seem
necessary or useful, one line must be left empty (to follow the consensual git
commit way), and either a paragraph, a list of items, or both can be written to
provide insight into the details of the commit. Those details can include
describing the workings of the change, explain a design choice, or providing a
tracker reference (issue number or bugreport link).

Sticking with the earlier example of the Squeak-On-Push mobile app feature, we
could have a commit formatted such as:
```ascii
FT: Provide an API (hook) to add custom actions on button push

Related to issue #245
 * Provide a simple way to hook a callback into the new OnPush API
 * The hook is called whenever the button is pushed/released
 * Multiple hooks can be registered for one button
```

The tags used in the commit message shall follow the same scheme as the tags
present in the `WIP` branch names, described in the
[Branching Scheme](#branching-guidelines).

## Merging code into the master

Once the work on his `WIP` branch is complete, contributor A can submit a
`Pull-Request` to merge his branch into the `master` branch. At this point,
every contributor can review the `PR`, and comment on it. Once at least two
contributors validate the PR through an ostensible "+1" comment, we deem the
code change validated by enough peers to assume it is valid. Then, the core
members of the project can act on the `PR` by merging the given commits into
the `master` branch.

The code reviews must include the following checks:
 * Ensuring the compliance to the coding style guidelines
 * Ensuring the presence and coverage of tests (unit and integration)
 * Ensuring the code is functional and working, through the tests
 * Ensuring the commit messages were properly formatted and as atomic as
   possible

## Managing and Maintaining Releases

Any merge into the `master` branch yields a potential `Release Candidate`. This
does not mean that every merge into the `master` branch will automatically
generate a release, though. When the team deems the state of the project worthy
of a `elease (be it due to a specific set of features making it into the
`master` branch or anything else), A specific `release` branch is created
starting from the specific merge commit bringing in the last relevant change.
```ascii
   WIP Branches         master        Release Branches
                          |
                          X
                          | \   /rel/1.0
                          |  +-------------+
                          |                |
                          v                v
```

In order to distinguish release branches from the `WIP` branches, they also
follow a concise naming scheme. As such, every release branch shall be named
after the version (major and minor) they embody. Indeed, the name shall begin
with "/rel/", then followed by the version's major number, a dot, and finally
the version's minor number. This way, we can follow the semantic versionning
scheme, increasing the version's patch number for each bugfix brought into the
release branch. For instance, for the 2.4.X version of the product,
the branch would be named:
```
/rel/2.4
```
In order to bring specific bugfixes or hotfixes into the release branch, the
patch has to go through the whole process of being reviewed before it's merged
into the `master` branch, and only then can it be cherry-picked (using the -x
option, in order to keep a reference to the original commit in the new commit
message) from the `master` branch to the given `release` branch. Then the
maintainer can bump the patch version of the given `release` branch.
```ascii
   WIP Branches         master        Release Branches
                          |
                          X
          /dev/BF/flow  / |
    +<-----<-----<---<-+  |
    |                     |
    X                     |
    |                     X
    X                     | \   /rel/1.0
    |  merge bufix into   |  +>--->--->--->+ # Set version to 1.0.0
    +->---->---->----->+  |                |
        master branch   \ |                |
                          X--->---->---->--X # Bump version to 1.0.1
                          | cherry-pick -x |
                          |                |
                          v                v
```


Coding Style Guidelines
=======================

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
