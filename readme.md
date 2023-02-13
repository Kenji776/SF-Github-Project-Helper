# Salesforce Github Project Helper

This is a Node.js application that makes setting up your Salesforce linked Github project easier. It also allows you to easily deploy new metadata and automate the version control tasks such as making branches, adding content, pushing branches and making pull requests.

## Setting Up Your Project

Simply download this projects contents and put them in a folder which will contain your Salesforce/Github project.
 
Modify the properties of the config.json to reflect to match your Salesforce org and Github instance. You will need to create a personal access token [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new). Once your config file is properly constructed launch the app either using the supplied .bat file (windows only) or run

`node SF-Github-Project-Helper`

Then select *Config Wizard* which will setup your project using your provided parameters.

## Deploying Changes

Once your project is set up, you can now use the utility to easily get content from Salesforce change sets, or package.xml files to be tracked in Github and pushed into the repo. Choose one of the three following approaches

### Deploying a single change set

Create your change set in Salesforce as you normally would. Start the utility and select *Push Changesets to GIT by entering names*. This will automatically create a branch of the same name, download the contents, add them to your branch, stage a commit (the commit message will be taken from the change set description you set in Salesforce), and push to the remote repo. Automatic pull request submission is in development for this feature.

### Deploying multiple change sets

The project helper makes it easy to quickly push multiple change sets into Github. Create them as you would normally, and record all their names. Then in the changeSetNames.json file enter them in JSON array format. Like this
`["Change Set One","Change Set Two","Change Set Three"]`
Then start the program. Select *Push Changesets to GIT from config file*. This will start the process of creating branches, downloading, adding the downloaded files to the branch, staging the commit (the commit message will be taken from the change set description you set in Salesforce) and pushing into the remote repo. Automatic pull request submission is in development for this feature.

### Deploying a package.xml file

The project helper can also deploy package.xml files. Create your package.xml file using whatever utility or process you like. Copy the file (it doesn't have to be named package.xml, it may have any name) into a sub directory of your project (manfiest folder is recommended). Then start the utility, select *Push Package.xml file contents to GIT*. You will be prompted to specify the file location, EX: *manfiest/my_packge_file.xml*. You will then be prompted to name your branch. The contents of the package.xml file will be downloaded and their contents added to your branch. You will then be prompted to enter a commit message. Once that is complete the changes will be pushed into the remote repo. If you have enabled automatic pull requests in the config.json you will now be prompted to enter a title and description. The pull request will then be submitted.

## Dependencies

- [Salesforce SFDX CLI](https://developer.salesforce.com/tools/sfdxcli)
- [Git](https://git-scm.com/downloads)
- [Node.JS](https://nodejs.org/en/)
- [Salesforce CLI Command Reference](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference.htm)

