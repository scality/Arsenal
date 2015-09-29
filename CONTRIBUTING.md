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

**As a first note, the rules for this project are heavily relying on [AirBnB's
coding style
guidelines](http://github.com/airbnb/javascript/blob/master/README.md).**

Following are the amendments that we chose to bring on top of the quoted
guidelines, in order to better fit our project.

## Irrelevant Sections

The sections 3.2, 3.3 and 25 of AirBnB's guidelines are relevant for our nodejs
use, as they relate to Jquery code, and to features relating to some specific
web browsers. They shall be ignored.

## Modified Sections and Rules

### [Whitespace](http://github.com/airbnb/javascript/blob/master/README.md#whitespace)

 * [18.1](http://github.com/airbnb/javascript/blob/master/README.md#18.1)
 Use soft tabs set to 4 spaces for the indentation of the code. Although this
 will reduce the efficient line length, this provide a better visibility for
 all sensibilities.
```
// bad
function() {
∙∙const name;
}

// bad
function() {
∙const name;
}

// good
function() {
∙∙∙∙const name;
}
```

## Additional Rules

### Comments

 * [17.6](#17.6) Even though single line comments are accepted, try to minimize
 them, as they are often forgotten when updating the code, and can thus easily
 get out of sync with the code itself.

 * [17.7](#17.7) No commented code shall find it way to the codebase, as it is
 an useless visual clutter, that holds no meaning most of the time, and is
 often outdated when it has a meaning. Prefer using `TODO` markers within
 comments to explain something instead.

 * [17.8](#17.8) API functions must be preceded by a small
 doxygen/jsdoc-formatted explanatory comment: What is the role of the function,
 what are the parameters, what are the possible return values, and whether it
 can throw exceptions:
 ```
 // bad
 /*
  * The blipMyFunc function takes one function in parameter and returns
  * true only when the given function fits a random criteria using the
  * parameter string.
  */
 function blipMyFunc(func, str) {
     ...
 }

 // good
 /*
  * This function blips a function using the parameter string str.
  * @function
  * @param {function} func  the function to blip
  * @param {string} str     the string to blip the function with
  * @return {boolean} true if func fits a random criteria using str
  * @return {boolean} false if func does not fit a random criteria using str
  * @throws {Error} Invalid Parameters
  */
 function blipMyFunc(func) {
    ...
 }
 ```
 Complex internal functions shall also be described through such a comment.

 * [17.9](#17.9) Complex parts of the code shall be preceded by a comment block
 explaining the WHY, the HOW, and the WHAT FOR. This also includes explaining
 the choice of the method or tool in a similar manner.

 * [17.10](#17.10) Avoid paraphrasing the code through the comments, as it is
 not useful and generates noise for code reading (reviews included)

### Coding Style General Rules

 * [29.1](#29.1) The usage of the use strict directive is required at the start
 of each file of code:
```
"use strict";
```

 * [29.2](#29.2) No line shall be longer than 80 characters, as such a length
 can provide, within modern working setups, the possibility to work on
 multiple files at the same time on one screen.

 * [29.3](#29.3) When naming Types, functions and variables, use semantically
 correct names that describe their use and objective.
 ```
 // bad
 let test = true;

 // bad
 let human = true;

 // good
 let userIsHuman = true;
 ```
