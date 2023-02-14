# Salesforce Github Project Helper

This is a Node.js application that makes setting up your Salesforce linked Github project easier. It also allows you to easily deploy new metadata and automate the version control tasks such as making branches, adding content, pushing branches and making pull requests.

## Why Does this exist? What problem does it solve?

When working on a Salesforce project with a diverse team not everyone may be familiar or comfortable using source control. People who make configuration changes in the org may not know how to move those changes into your source control repository. This creates an issue because obviously you want your source control to be the source of truth, which it cannot be if not all the work being doing is being properly tracked. This utility attempts to make it painless for non developer users to setup the project, fetch the changes they made in the Salesforce org to their local machine, and then push them into Github. Because it uses a configuration file to store all the connection settings that can be pre-built for your non developer users you can just send them a config for your project and they can be up and running in just a few minutes.

## How does it work?

This is essentially a 'wrapper' that simplifies all the console commands one would need to enter to setup and work with a SFDX/Github project. Instead of having to remember a bunch of Git, SFDX, and Github CLI commands this utility will construct and execute the proper commands using the information provided in the config.json file and by the user at run time. You give it the information about your project and what you want to get into Github, it builds and runs the commands. Everything is logged so you can see exactly what it's doing so you can feel confident that it's operating correctly, or at very least fix anything that gets screwed up.

## Setting Up Your Project

Simply download this projects contents and put them in a folder which will contain your Salesforce/Github project. You optionally may clone this repo, with

`git clone https://github.com/Kenji776/SF-Github-Project-Helper.git`
 
Modify the properties of the config.json to reflect to match your Salesforce org and Github instance. You will need to create a personal access token [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new). Once your config file is properly constructed launch the app either using the supplied .bat file (windows only) or run

`node SF-Github-Project-Helper`

Then select *Config Wizard* which will setup your project using your provided parameters.

## Pushing Changes

Once your project is set up, you can now use the utility to easily get content from Salesforce change sets, or package.xml files to be tracked in Github and pushed into the repo. Choose one of the three following approaches

### Pushing a single change set

Create your change set in Salesforce as you normally would. Start the utility and select *Push Changesets to GIT by entering names*. This will automatically create a branch of the same name, download the contents, add them to your branch, stage a commit (the commit message will be taken from the change set description you set in Salesforce), and push to the remote repo. Automatic pull request submission is in development for this feature.

### Pushing multiple change sets

The project helper makes it easy to quickly push multiple change sets into Github. Create them as you would normally, and record all their names. Then in the changeSetNames.json file enter them in JSON array format. Like this
`["Change Set One","Change Set Two","Change Set Three"]`
Then start the program. Select *Push Changesets to GIT from config file*. This will start the process of creating branches, downloading, adding the downloaded files to the branch, staging the commit (the commit message will be taken from the change set description you set in Salesforce) and pushing into the remote repo. Automatic pull request submission is in development for this feature.

### Pushing a package.xml file contents

The project helper can also deploy package.xml files. Create your package.xml file using whatever utility or process you like. Copy the file (it doesn't have to be named package.xml, it may have any name) into a sub directory of your project (manfiest folder is recommended). Then start the utility, select *Push Package.xml file contents to GIT*. You will be prompted to specify the file location, EX: *manfiest/my_packge_file.xml*. You will then be prompted to name your branch. The contents of the package.xml file will be downloaded and their contents added to your branch. You will then be prompted to enter a commit message. Once that is complete the changes will be pushed into the remote repo. If you have enabled automatic pull requests in the config.json you will now be prompted to enter a title and description. The pull request will then be submitted.

## Dependencies

- [Salesforce SFDX CLI](https://developer.salesforce.com/tools/sfdxcli)
- [Git](https://git-scm.com/downloads)
- [Node.JS](https://nodejs.org/en/)
- [Github CLI](https://cli.github.com/)



