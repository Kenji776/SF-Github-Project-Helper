/**
 * @Name SF-Github-Project-Helper
 * @Date 2/1/2023
 * @Author Daniel Llewellyn
 * @Description This is a Node.js application that makes setting up your Salesforce linked Github project easier. It also allows you to easily deploy new metadata and automate the version control tasks such as making branches, adding content, pushing branches and making pull requests
 */
 
const configFileName = "config.json";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { promisify } = require("util");
const { resolve } = require("path");
const readdir = promisify(fs.readdir);
const xml2js = require("xml2js");
const parseString = xml2js.parseString;
const readline = require('readline');

//allows for user input
function prompt(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}

//default config options
let config = {
    skipExistingChangeSets: true,
	changesetJSONFile: "changeSetNames.json",
	autoCreatePullRequest: false,
	autofillPullRequestDetails: true
};

/**
* @Description Entry point function. Loads configuration, checks it for validity and calls the menu to display to the user
*/
async function init() {
    console.log("                                    Salesforce/Github Project Helper\r\n");
    console.log("                                     Author: Kenji776\r\n");

    let d = new Date();
    d.toLocaleString();

    log("Started process at " + d, false);
	

    //load the configuration from the JSON file.
    let loadedConfig = loadConfig(configFileName);
    config = { ...config, ...loadedConfig };	
	
	let configsValidResponse = checkConfigsValid(config);
	
	if(!configsValidResponse.valid) throw new Error(configsValidResponse.message);
	
	displayMenu();
}

/**
* @Description Checks the validity of a configuration object (loaded from a config.json) using some pre-built rules. Helps ensure the user hasn't accidentally entered bad values or forgot to populate something.
* @Param configObject a javascript object created from a config.json file (a key/value pair object)
* @Return object with a 'valid' and 'message' property indicating if the configuration is valid (valid=true/false) and a message with further details about the result.
*/
function checkConfigsValid(configObject){
	
	//return object
	let configValid = {
		valid: true,
		message: "Configs Valid!"
	}
	
	//check to ensure the github username doesn't have an @ in it. I kept accidentally doing that and it breaks the 'git clone' call.
	if(configObject.gitUsername.indexOf('@') > -1){
		configValid.valid = false;
		configValid.message = "Github username has an @ symbol. It must not. Remove the @ portion of the username and try again";
	}
	
	//check to ensure all properties of the config are populated.
	//TODO: Make this list of required properties a variable of some kind. All properties may not be required in the future and this check could be over aggressive.
	for(let property in configObject){
		if(configObject[property] == "") {
			configValid.valid = false;
			configValid.message = `Property ${property} in config must not be empty. Please populate it and try again`;	
		}
	}
		
	return configValid;
}

/**
* @Description displays an interactive menu to the user to allow them to select which operation they would like to perform. Upon completion it calls itself again unless the user exits the program.
*/
async function displayMenu(){
	//clearScreen();
	console.log('\n\nPlease select option');
	console.log('0) Config Wizard (Import Settings from config file)');
	console.log('1) Connect GIT Repo');
	console.log('2) Display GIT Repo Information');
	console.log('3) Setup SFDX Project');
	console.log('4) Display SFDX Information');
	console.log('5) Push Changesets to GIT from config file');
	console.log('6) Push Changesets to GIT by entering names');
	console.log('7) Push Package.xml file contents to GIT');
	console.log('8) View Config File Information');
	console.log('9) Authorize Github CLI');
	console.log('10) Exit');
	
	let menuChoice = await prompt('\nEnter Selection: ');
	
	switch (menuChoice) {
		case '0':
			await configWizard(config);
			
			break;
		case '1':
			let repoURL = await prompt('Git Repo URL: ');
			let userName = await prompt('Git Username: ');	
			let pat = await prompt('Git Personal Access Token: ');	
			await connectToRepo(userName,pat,repoURL);
			break;
			
		case '2':
			await runCommand('git remote show origin');
			break;
			
		case '3':
			let projectName =  await prompt('Enter Name for this project: ');
			await setupSFDXProject(projectName);
			let orgAlias =  await prompt('Enter Name of org (can be the same as the project): ');
			await authorizeSFOrg(orgAlias);
			break;
			
		case '4':
			log(`Connected to org using username: ${config.salesforceUsername}`, true,'green');
			break;
			
		case '5':
			await getChangesetsFromFile();
			break;
			
		case '6':
			await getChangeSetsFromInput();
			break;
			
		case '7':
			await getPackageXML();
			break;
			
		case '8':
			console.log(config);
			break;		
		case '9':
			await authorizeGithubCLI(config.githubPersonalAccessToken);
			break;
		case '10':
			finish();
			break;
		case '11':
			submitGithubPullRequest('test-of-automatic-pr-open');
			break;
	}
	
	displayMenu();
}

/**
* @Description Creats a project folder, clones the Github repo, initilizes the SFDX project, authorizes the org, and authorizes Github CLI by using properties from the config
* @Param configObject a javascript object created from a config.json file (a key/value pair object)
* @Return true if no error occured
*/
async function configWizard(configObject){
	log('Config Wizard Invoked');
	//create the project directory
	if(!fs.existsSync(configObject.projectName)) fs.mkdirSync(configObject.projectName);
	
	//authoraize github with token
	if(config.autoCreatePullRequest){
		let githubAuthorizeResult = await authorizeGithubCLI(configObject.githubPersonalAccessToken);	
		
		if(githubAuthorizeResult.exit_code != 0) {
			log(`Error authorizing Github. ${githubAuthorizeResult.output}`,true,'red');
			return false;
		}
	}
	
	//init git with the repo
	let connectToRepoResult = await connectToRepo(configObject.gitUsername, configObject.githubPersonalAccessToken, configObject.githubRepoUrl);
	
	if(connectToRepoResult.exit_code != 0) {
		log(`Error cloning remote repository. ${connectToRepoResult.output}`,true,'red');
		return false;
	}
	
	//init the SFDX project
	let setupSFDXProjectResult = await setupSFDXProject(configObject.projectName);
	
	if(setupSFDXProjectResult.exit_code != 0) {
		log(`Error creating SFDX project. ${setupSFDXProjectResult.output}`,true,'red');
		return false;
	}
	
	//authorize the org.
	let authorizeSFOrgResult = await authorizeSFOrg(configObject.salesforceLoginURL,configObject.projectName);
	
	if(authorizeSFOrgResult.exit_code != 0) {
		log(`Error authorizing Salesforce Org. ${authorizeSFOrgResult.output}`,true,'red');
		return false;
	}
	
	log('Salesforce connected and git repo configured!',true,'green');
	
	return true;
}

/**
* @Description Initilizes GIT in the current folder and clones the given repo with the given username
* @Param userName the user name used to access the repository
* @Param pat A github Personal access token that is used to authenticate the user
* @Param repoURL The gitHub repo location. EX: https://github.com/Kenji776/SF-Github-Project-Helper.git
* @Return Object with result of clone operation, including 'exit_code' and 'output'
*/
async function connectToRepo(userName, pat, repoURL){
	
	if (fs.existsSync(`${config.projectName}\\.git`)){
		log('GIT Folder already exists. Please delete .git folder before attempting to clone the repository',true,'yellow');
		return {'exit_code':0,'output':'Git folder already exists'};
	}

	log(`Current folder ${process.cwd()}. Changing into project folder ${config.projectName}`,true,'green');

	navigateToProjectDir();	
	
	console.log(`Cloning git repo into ${process.cwd()}`,true,'green');
	
	let repoURN = config.githubRepoUrl;
	
	//we only need to modify the url if the username isn't specified (with an @ symbol)
	//todo, add an additional check to check for : to dynamically insert personal access token. for the moment it just assumes no username, no password which makes sense.
	if(repoURN.indexOf('@') == -1){
		//combine in the fomat of https://username@github.com/author/Changeset/repo.git
		let position = 8;
		repoURN = [repoURL.slice(0, position), userName+':'+pat+'@', repoURL.slice(position)].join('');
	}
	
	let command = `git clone ${repoURN} .`;
	
	
	//we don't want to attempt to write to the log here since we are currently in a different working directory and then will generate a log file in that directory which will cause the 
	//clone to fail since the directory is not empty. Instead we just record the command to be executed and write it to the log later.
	//TODO: Fix the log function to somehow locate where the proper log is so it doesn't write to the wrong folder.
	
	//ensure to delete any rogue log files that might have ended up in this directory.
	if (fs.existsSync('log.txt')) fs.unlinkSync('log.txt');
	let cloneResult = await runCommand(command,[],true);
	
	//change directory back up to root so the sfdx commands will write into the project folder.
	process.chdir('..');
	
	//log(`Navigated up a folder into ${process.cwd()}.`);
	
	log(maskString(command),true,'green');
	log('Clone process result: ' + JSON.stringify(cloneResult,null,2));
	
	return cloneResult;
}


/**
* @Description initilizes the SFDX project in the project folder
* @Param projectName a string which is the name of the project.
* @Return Object with result of sfdx force:project:create operation, including 'exit_code' and 'output'
*/
async function setupSFDXProject(projectName){	
	log(`Setting up Salesforce DX Project ${projectName}`,true,'green');
	if (fs.existsSync(`${projectName}\\.sfdx`)){
		log('SFDX Project folder already exists. Skipping project creation',true,'yellow');
		return;
	}
	return await runCommand(`sfdx force:project:create -n ${projectName} --manifest`);
}

/**
* @Description uses SFDX to connect to an org and sets it as default.
* @Param loginURl The Salesforce login endpoint. Ex 'https://test.salesforce.com', 'https://login.salesforce.com', 'https://my-custom-domain.sandbox.my.salesforce.com/' 
* @Param orgAlias Currently unused. Sets the alias of the org. Removed because it was causing errors for some reason.
* @Return Object with result of sfdx auth:web:login operation, including 'exit_code' and 'output'
*/
async function authorizeSFOrg(loginUrl, orgAlias){
	log(`Authorizing Org ${orgAlias}. Wait for browser window to open and login...`,true,'green');
	return await runCommand(`sfdx auth:web:login --instanceurl ${loginUrl} --setdefaultusername`);
}

/**
* @Description reads a list of Salesforce change set names from file specified in the config. Parses the JSON and after prompting the user that they would like to continue, fetches the contents of the change sets and 
* pushes them into their own Git branch (one per change set). Then pushes them into the repo.
*/
async function getChangesetsFromFile(){
	let changeSetsToFetchArray = readJSONFromFile(config.changesetJSONFile);
		
	log(`Loaded: ${changeSetsToFetchArray}. Continue downloading/pushing these change sets?`);
	let menuChoice =  await prompt('Y/N: ');
	if(menuChoice.toLowerCase()	== 'y' || menuChoice.toLowerCase() == 'yes') populateAndPushBranches(changeSetsToFetchArray);
	else displayMenu();
}

/**
* @Description gets the name of a change set from user input. fetches the contents of the change set and pushes it into a Git branch. Then pushes them into the repo.
*/
async function getChangeSetsFromInput(){
	const enteredCSNames =  await prompt('Please enter change set name to fetch. You may enter multiple change sets separated by a comma: ');
	let changeSetsToFetchArray = enteredCSNames.split(',');

	log(`Entered: ${changeSetsToFetchArray}. Continue downloading/pushing these change sets?`);
	let menuChoice =  await prompt('Y/N: ');
	if(menuChoice.toLowerCase()	== 'y' || menuChoice.toLowerCase() == 'yes') populateAndPushBranches(changeSetsToFetchArray);
	else displayMenu();
}

/**
*@Description Initiates an interactive prompt to allow a user to download the contents of a specified package.xml file and push them into a new branch, then commit that branch and push it to the remote repo.
*/
async function getPackageXML(){
	navigateToProjectDir();
	console.log('Current Directory: ' + process.cwd());
	const packageFileLocation = await prompt('Please enter the location/name of your package.xml file: ');
	if (!fs.existsSync(packageFileLocation)) log('File not found. Please check the location and try again',true,'red');
	else {		
		var branchName = '';
		var validName = false;
		while(!validName){
			branchName =  await prompt('Enter the name for your Git branch (story|bug/user-story-name): ');
			validName = validateGitBranchName(branchName);
		}
		await createGitBranch(branchName);
		
		//checkout the branch
		await changeToGitBranch(branchName);		

		//because it would be pretty difficult to figure out what elements in a package.xml file create what files (actually you might just be able to concat the type+'/'+membername+'.xml' and get the path that way. Wouldn't
		//work with wildcard retreives though...)
		//instead we just put a file system watcher on the directory. Any file that gets modified that ends with .xml is added to our list of files to add to our git branch.
		var modifiedFiles = [];
		const watcher = fs.watch('./', {recursive: true}, (eventType, filename) => {
			if(filename.endsWith('.xml')) modifiedFiles.push(filename);
		})
	
		log('Fetching package contents',true,'green');
		await runCommand(`sfdx force:source:retrieve -x ${packageFileLocation} -u ${config.salesforceUsername}`);

		//remove duplicates.
		modifiedFiles = [...new Set(modifiedFiles)];
		
		watcher.close();
		
		log('Staging modified/created files',true,'green');		
		for(const fileName of modifiedFiles){
			log(`Adding file ${fileName} to branch`,true,'green');
			await runCommand(`git add ${fileName}`);
		}
		//TODO: Attempt to read description from package.xml here if it exists.
		let commitMessage  = await prompt('Please enter a commit description (what is this branch for?): ');
		
		await gitCommit(commitMessage);
		
		await pushBranchToRemote(branchName);
		
		if(config.autoCreatePullRequest){
			await submitGithubPullRequest(branchName);
		}
	}
}

/**
* @Description submits a github pull request for the given branch using the given title and description. If successful then attempts to open a browser tab to the PR so it can be merged.
* @Param branchName the name of the branch to create a pull request for
* @Param title the title of the pull request
* @Param description a description of the pull request
*/
async function submitGithubPullRequest(branchName){
	
	let title = '';
	let description = '';
	
	//if we are not auto filling the PR details, then ask for them from the user now.
	if(!config.autofillPullRequestDetails){
		title = await prompt('Please title for pull request: ');
		description = await prompt('Please description for pull request: ');		
	}
	//todo allow for putting in extra flags for the pull command by reading from a file or something. Like automatically setting approvers/reviewers etc.
	let result = await makeGithubPR(branchName, title, description);
	 
	console.log('Result of PR call');
	console.log(JSON.stringify(result,null,2));
	
	//look to see if we have a URL pointing to where the pull request is, so we can then open a browser window to it to complete the merge.
	if(result.exit_code === 0){
		log('Pull request completed! You still must merge this to get it into the master branch!',true,'green');
		let resultOutput = result.output;
		let url = resultOutput.substring(resultOutput.indexOf('https:'),resultOutput.size).trim();
		log('Pull request URL: ' + url,true);
		var start = (process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open');
		await runCommand(start + ' ' + url);		
	}
}

/**
* @Description navigates the current working directory to that of the project root folder.
*/
function navigateToProjectDir(){
	//get the current folder path.
	let currentPath = process.cwd();
	
	//if the name of our project exists in the path (which it always should), but it's not the last part of the path (meaning it's not the current directory). Then move up a folder until it is.
	let maxIterations = 20;
	let currentIterations = 0;
	
	//if we are withing a sub folder of the project directory, then navigate up until we get into it.
	if(currentPath.indexOf(config.projectName) > -1){
		log(`Detected current working directory is sub directory of project folder.`);
		while(!currentPath.endsWith(config.projectName)) {	
			log(`Navigating up a folder to try and find directory ${config.projectName}`);
			console.log('Current path: ' + currentPath);
			
			process.chdir('..');
			currentPath = process.cwd();
			
			//sanity check just to ensure we don't somehow end up in an infinite loop. 
			currentIterations++;
			if(currentIterations > maxIterations) break;
		}
	}
	//if the name of this project is not in the path, then we must be above it in the directory structure. The best we can do is try to navigate down into it if it exists. If it isn't there then we have no idea 
	//where in the directory structure the project folder is so there is nothing we can do.
	else{
		log(`Changing into sub directory ${config.projectName}`);
		if(fs.existsSync(config.projectName)) process.chdir(config.projectName);
	}
}

/**
* @Description validates that a given string is a valid name for a github branch. 
* @Param branchName the string to check for validity
* @Return boolean value. True if the string is valid, false if it is not.
* @TODO Update this function to have better rules/matching.
*/
function validateGitBranchName(branchName){
	/*
	let branchRegex = '^(main|development|master|(features|tests|(bug|hot)fix)(\/[a-zA-Z0-9]+([-_][a-zA-Z0-9]+)*){1,2}|release\/[0-9]+(\.[0-9]+)*(-(alpha|beta|rc)[0-9]*)?)$';
	const regex = new RegExp(branchRegex);
	let result =  regex.test(branchName);
	if(!result) log('Invalid GIT branch name',true,'red');
	return result;
	*/
	return true;
	
}

/**
 * @Description Uses SFDX CLI to download all the given change sets.
 * @Param changeSetName an array of strings that are changeset names.
 * @param copyToProjectFolder boolean. Should the downloaded change set contents be copied to the project folder?
 * @Return true when all change sets have finished downloading.
 */
async function fetchChangeSets(changeSetNames, copyToProjectFolder) {
	if (!fs.existsSync(config.downloadedPackagesFolder)) fs.mkdirSync(config.downloadedPackagesFolder);
	
    for (const changeSetName of changeSetNames) {
        if (config.skipExistingChangeSets && fs.existsSync(`${config.downloadedPackagesFolder}\\${changeSetName}`)) {
            log(`Change set: "${changeSetName}" already exists and skipExistingChangeSets is set to true. Skipping download`);
        } else {
            log(`Fetching: "${changeSetName}"...`);

			var modifiedFiles = [];
			
			//start a file system watcher so we can see what gets downloaded.
			const watcher = fs.watch('./', {recursive: true}, (eventType, filename) => {
				if(filename.endsWith('.xml')) modifiedFiles.push(filename);
			})
			//download the contents of the change set
            await runCommand("sfdx", [`force:mdapi:retrieve`, `-s`, `-u "${config.salesforceUsername}"`, `-r ./${config.downloadedPackagesFolder}`, `-p "${changeSetName}"`, `--unzip`, `--zipfilename "${changeSetName}.zip"`]);
        
			//if we are not moving the files into the project folder, then we are done and can just return the list of downloaded files. Otherwise we need to copy the files over and return an updated list
			//of files (the ones that are the result of the copy operation) and return that.
			if(!copyToProjectFolder){
				modifiedFiles = [...new Set(modifiedFiles)];
				return modifiedFiles;
				watcher.close();
			}
			else{
				//clear out the array
				modifiedFiles = [];			
				//move the files from the download location into the project folder
				copyPackageIntoProjectFolder(changeSetName);
				modifiedFiles = [...new Set(modifiedFiles)];
				watcher.close();
				return modifiedFiles;
			}
		}
    }
    return [];
}

/**
* @Description When a change set is downloaded using force:mdapi:retrieve it goes into the config.downloadedPackagesFolder. For those contents to be properly integrated into the repo they need to be copied into the 
* actual project folder. This function does a recursive copy from the package folder into the project folder.
* @Param packageName The name of the folder/change set that contains the content to be copied into the org folder
* @TODO Make the copy destination configurable. Right now it just hard coded to write to the default force-app\main\default\ folder.
*/ 
function copyPackageIntoProjectFolder(packageName){
	copyFolderRecursiveSync(`${config.downloadedPackagesFolder}\\${packageName}`, `${config.projectName}\\force-app\\main\\default\\`);
}
/**
* @Description copies all contents of source directory into target directory
* @Param source string that is the path of the source folder
* @Param target string that is the path of the destination folder
*/
function copyFolderRecursiveSync( source, target ) {
    var files = [];

    // Check if folder needs to be created or integrated
    var targetFolder = path.join( target, path.basename( source ) );
    if ( !fs.existsSync( targetFolder ) ) {
        fs.mkdirSync( targetFolder );
    }

    // Copy
    if ( fs.lstatSync( source ).isDirectory() ) {
        files = fs.readdirSync( source );
        files.forEach( function ( file ) {
            var curSource = path.join( source, file );
            if ( fs.lstatSync( curSource ).isDirectory() ) {
                copyFolderRecursiveSync( curSource, targetFolder );
            } else {
                copyFileSync( curSource, targetFolder );
            }
        } );
    }
}

/**
* @Description given an array of strings that are valid change sets, this function will create branches for each, download the change set contents, add the downloaded files to the branch, and push the branches into the remote repo.
* @Param branchNames an array of strings that are valid change set names in the connected Salesforce org.
*/
async function populateAndPushBranches(branchNames){
	for (const branchName of branchNames) {
		log(`\n\n\n------------------------- PROCESSING BRANCH ${branchName} ------------------------\n\n\n`,true,'green');
		//create our branch
		await createGitBranch(branchName);
		
		//checkout the branch
		await changeToGitBranch(branchName);

		//fetch the contents of the change set for our branch
		let downloadedFiles = await fetchChangeSets([branchName]);
		
		//add the related folder to the branch
		//await addFolderToBranch(`${config.downloadedPackagesFolder}\\${branchName}`);
		log('Staging modified/created files',true,'green');		
		for(const fileName of downloadedFiles){
			log(`Adding file ${fileName} to branch`,true,'green');
			await runCommand(`git add ${fileName}`);
		}		
		
		//set our commit message from the package.xml description
		let packageXMLJSON = getPackageXMLAsObject(branchName);
		let commitMessage = packageXMLJSON.Package.description;
		await gitCommit(commitMessage)
		
		//push the branch 
		await pushBranchToRemote(branchName);
	}
}

/**
 * @Description Parses the raw HTML content fetched by getOutboundChangeSets() to return an array containing all the change set names.
 * @Param html a string of HTML that contains the change set names fetched from the Salesforce UI
 * @Return
 */
function loadConfig(configFileName) {
    return readJSONFromFile(configFileName);
}

/**
* @Description writes the current working config back into the config.json file
*/
function saveConfig(){
	fs.writeFileSync('config.json', JSON.stringify(config, null, 2), function(err){
		if(err) {
			return log(err);
		}
		log("The file was saved!");
	});
}

/**
* @Description reads the package.xml file from a given folder (change set) and returns it as a JSON object.
* @Param folderName the name of the folder (change set) in the config.downloadedPackagesFolder folder to read the package.xml of.
* @Return a javascript object representation of the package.xml file.
*/
function getPackageXMLAsObject(folderName){
	let packageXMLAsJson = {};
	const packageXMLAsString = fs.readFileSync(`${config.downloadedPackagesFolder}\\${folderName}\\package.xml`, function (err) {
        log("File not found or unreadable. Skipping import" + err.message, true, "red");
        return null;
    });
	//parse the XML into javascript object.
    parseString(packageXMLAsString, function (err, result) {
		packageXMLAsJson = result;
		
    });
	
	return packageXMLAsJson;
}
/**
 * @Description Reads and parses JSON from a given file.
 * @Param fileName the name of the file to read, parse, and return.
 * @Return a JSON object.
 */
function readJSONFromFile(fileName) {
    const changeSetsJsonString = fs.readFileSync(fileName, function (err) {
        log("File not found or unreadable. Skipping import" + err.message, true, "red");
        return null;
    });

    const parsedJSON = JSON.parse(changeSetsJsonString);
    return parsedJSON;
}

/**
* @Description converts a package name to a valid Git branch name by replacing spaces with dashes.
* @Param packageName a string to convert into a valid Git branch name.
* @Return a string that is the converted/fixed name/
*/
function convertPackgeNameToGitName(packageName){
	let branchName = packageName.replace(/\s/g , "-");
	return branchName;
}

/**
* @Description masks a string so that it can be output/logged without revealing it's entire value. Useful for logging statments that include passwords/keys/personal access tokens etc.
* @Param maskString a string to be masked
* @Param maskPercent a numeric value that controls how much of the string should be masked. Defaults to 80 (80%) if not provided.
* @Return a masked version of the string with [maskPercent] amount of the string replaces with asterisks.
*/
function maskString(maskString, maskPercent = 80){
	let stringLength = maskString.length;
	let numMaskChars = Math.round(stringLength * (maskPercent/100));
	let mask = Array(numMaskChars).join('*');
	let maskedString = mask + maskString.substr(stringLength-(stringLength-numMaskChars));
	return maskedString;
}

/**
* @Description invokes the 'git remote set-url' command to set the repo UIL to the provided repoUrl
* @Param repoURL string containing the location of the remote repo in https:// url format.
* @Return Object with result of operation, including 'exit_code' and 'output
*/
async function setGitRemoteURL(repoUrl){
	let command = `git remote set-url ${repoUrl}`;
	log(`Setting GIT Repo URL: ${command}`,true);
	return await runCommand(command); 
}

/**
* @Description invokes the 'git branch' command to create a new git branch if one by that name does not exist in the local repo.
* @Param branchName a string that is the name of the branch to create
* @Return Object with result of operation, including 'exit_code' and 'output
*/
async function createGitBranch(branchName){
	branchName = convertPackgeNameToGitName(branchName);
	
	if(!checkIfBranchExists(branchName)){
		let command = `git branch ${branchName} -f`;
		log(`Creating branch ${branchName}: ${command}`,true);
		return await runCommand(command); 
	}
	return 0;
}

/**
* @Description invokes the 'git checkout' command to check out a branch of the given name
* @Param branchName the name of the branch to check out and set to the working branch
* @Return Object with result of operation, including 'exit_code' and 'output
*/
async function changeToGitBranch(branchName){
	branchName = convertPackgeNameToGitName(branchName);
	let command = `git checkout -b ${branchName}`;
	log(`Changing to branch ${branchName}: ${command}`,true);
	return await runCommand(command); 
}

/**
* @Description invokes the 'git push -u origin HEAD' command to push the changes into the repo
* @Param branchName a string that is the name of the branch to push
* @Return Object with result of operation, including 'exit_code' and 'output
*/
async function pushBranchToRemote(branchName){
	branchName = convertPackgeNameToGitName(branchName);
	//let command = `git push -u origin ${branchName}`
	let command = `git push -u origin HEAD`
	log(`Pushing branch to remote ${branchName}: ${command}`,true);
	return await runCommand(command);
}

/**
* @Description invokes the 'git add' command to add the contents of a folder to a branch. Uses the --force flag to include things that may normally be ignored
* @Param folderName a string that is the name of the folder on the local machine to add into the branch.
* @Return Object with result of operation, including 'exit_code' and 'output
*/
async function addFolderToBranch(folderName){
	let command = `git add "${folderName}" --force`;
	log(`Adding folder to branch ${folderName}: ${command}`,true);
	return await runCommand(command);
}

/**
* @Description invokes the 'git commit' command to stage a commit to be pushed into the remote repo
* @Param commitMessage a string that is the message to include as the commit description
* @Return Object with result of operation, including 'exit_code' and 'output
*/
async function gitCommit(commitMessage){
	let command = `git commit -m "${commitMessage}" -a`;
	log(`Commiting branch: ${command}`,true);
	return await runCommand(command);
}

/**
* @Description a function to check if a local branch exists to prevent attempting to create a duplicate. Does not currently work, but attempting to create a duplicate branch is not a fatal error
* @Param branchName a string that is the name of the branch to check if already exists.
* @Return a boolean value. True if the branch exists. False if it does not.
*/
async function checkIfBranchExists(branchName){
	let output = await runCommand(`git branch -l ${branchName})`);
	if(output.length > 0 || output == 0) return true;
	else return false;
}

/**
* @Description invokes the 'gh auth login' command to authorize the Github CLI to interact with the repo so pull requests may be created automatically.
* @Param token a string that is the personal access token to authenticate to the repo.
* @Return Object with result of authorize operation, including 'exit_code' and 'output
*/
async function authorizeGithubCLI(token){
	log(`Authorizing Github connection with personal access token: ${maskString(token)}`,true);
	//we have to read the token from a file, so we have to create that now
	fs.writeFileSync('temp_token', token, function(err){
		if(err) {
			return log(err);
		}
		log("The token file was saved!");
	});
	
	let command = `gh auth login --with-token <temp_token`;	
	let commandResponse = await runCommand(command);
	fs.unlinkSync('temp_token');
	return commandResponse;
}

/**
* @Description uses the Github CLI to create a pull request. If title or description are not provided, then they are autofilled from the last commit
* @Param branchName the name of a Git branch to make a pull request for
* @Param title the title to give to this pull request.
* @Param description the description for this pull request.
* @TODO allow for putting in extra flags for the pull command by reading from a file or something. Like automatically setting approvers/reviewers etc.
*/
async function makeGithubPR(branchName, title='', description=''){
	let command  = `gh pr create -H ${branchName}`;
	if(!title || !description || title == '' || description == ''){
		log(`Creating pull request for branch ${branchName}. Autofilling title and description from commit`);
		command +=' --fill';
	}else{
		log(`Creating pull request for branch ${branchName}. Title: ${title}. Description: ${description}`);
		command += ` --title "${title}" --body "${description}`;

	}
	log(`Submitting Pull Request for branch ${branchName} with command: ${command}`);
	return await runCommand(command);
	
}

/**
* @Description clears the terminal screen.
*/
function clearScreen(){
	console.log('\033[2J');
	process.stdout.write('\033c');
}
/**
 * @Description Runs a shell command.
 * @Param command the name of the command to execute WITHOUT any arguments.
 * @Param arguments an array of arguments to pass to the command.
 * @Return javascript promise object that contains the result of the command execution
 */
function runCommand(command, arguments = [], nolog) {
	if(!nolog) log(command +  ' ' + arguments.join(' '));
    let p = spawn(command, arguments, { shell: true, windowsVerbatimArguments: true });
    return new Promise((resolveFunc) => {
		var output ='';
        p.stdout.on("data", (x) => {
            //process.stdout.write(x.toString());
            if(!nolog) log(x.toString());
			output += x;
        });
        p.stderr.on("data", (x) => {
			//process.stderr.write(x.toString());
            if(!nolog) log(x.toString());
			output += x;
        });
        p.on("exit", (code) => {
			let returnObject = {'exit_code': code, 'output': output};
			if(!nolog) log('Command complete. Result: ' + JSON.stringify(returnObject, null, 2),false);
            resolveFunc(returnObject);
        });
    });
}

/**
 * @Description Creates a log entry in the log file, and optionally displays log entry to the terminal window with requested color.
 * @Param logItem a string of data to log
 * @Param printToScreen boolean flag indicating if this entry should be printed to the screen (true) or only to the log file (false)
 * @Param a string {'red','green','yellow'} that indicates what color the logItem should be printed in on the screen..
 */
function log(logItem, printToScreen, color) {
    printToScreen = printToScreen != null ? printToScreen : true;
    var colorCode = "";
    switch (color) {
        case "red":
            colorCode = "\x1b[31m";
            break;
        case "green":
            colorCode = "\x1b[32m";
            break;
        case "yellow":
            colorCode = "\x1b[33m";
    }

    if (printToScreen) console.log(colorCode + "" + logItem + "\x1b[0m");

    fs.appendFile("log.txt", logItem + "\r\n", function (err) {
        if (err) {	
			console.log('Unable to write to log file');
			console.log(err);
		}
    });
}

/**
 * @Description Method that executes at the end of a successful script run. Exits the program.
 */
function finish() {
    log("Process completed", true, "yellow");
    log("\r\n\r\n------------------------------------------------ ", false);
    process.exit(1);
}

/**
 * @Description Method that executes on an uncaught error.
 */
process.on("uncaughtException", (err) => {
    log(err, true, "red");
	console.trace(err);
    process.exit(1); //mandatory (as per the Node docs)
});

init();