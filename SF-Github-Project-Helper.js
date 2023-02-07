/**
 * @Name ChangeLogBuilder
 * @Date 2/1/2023
 * @Author Daniel Llewellyn
 * @Description This script will download a changeset from a specified Salesforce org, create a branch in GIT, push the contents of the changeset into the branch, then push it to Git.
 */
 
const configFileName = "config_demoOrg.json";
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

let config = {
    skipExistingChangeSets: true,
    rootFolder: "packages",
    username: "",
	changesetJSONFile: "changeSetNames.json",
};

async function init() {
    log("                                    Changeset to GIT 1.0!\r\n", true, "green");
    log("                                     Author: Dan Llewellyn\r\n", true);

    let d = new Date();
    d.toLocaleString();

    log("Started process at " + d, false);
	

    //load the configuration from the JSON file.
    let loadedConfig = loadConfig(configFileName);
    config = { ...config, ...loadedConfig };	
	
	
	
		
	displayMenu();
}

async function displayMenu(){
	//clearScreen();
	log('\n\nPlease select option',true);
	log('0) Config Wizard (Import Settings from config file)',true);
	log('1) Connect GIT Repo',true);
	log('2) Display GIT Repo Information',true);
	log('3) Setup SFDX Project',true);
	log('4) Display SFDX Information',true);
	log('5) Push Changesets to GIT from config file',true);
	log('6) Push Changesets to GIT by entering names',true);
	log('7) Push Package.xml file contents to GIT',true);
	log('8) View Config File Information',true);
	log('9) Exit',true);
	
	let menuChoice = await prompt('\nEnter Selection: ');
	
	switch (menuChoice) {
		case '0':
			await configWizard();
			break;
		case '1':
			let repoURL = await prompt('GIT Repo URL: ');
			let userName = await prompt('GIT Username: ');
	
			await connectToRepo(userName,repoURL);
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
			log(`Connected to org using username: ${config.username}`, true,'green');
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
			finish();
			break;
	}
	
	displayMenu();
}

async function configWizard(){
	//create the project directory
	if(!fs.existsSync(config.projectName)) fs.mkdirSync(config.projectName);
	
	//change working directory to new folder
	navigateToProjectDir();
	
	//init git with the repo
	await connectToRepo(config.gitUsername, config.githubRepoUrl);
	
	//change directory back up to root so the sfdx commands will write into the project folder.
	process.chdir('..');
	
	//init the SFDX project
	await setupSFDXProject(config.projectName);
	
	//authorize the org.
	await authorizeSFOrg(config.salesforceLoginURL,config.projectName);
	
	log('Salesforce connected and git repo configured!',true,'green');
	
}

/**
* @Description Initilizes GIT in the current folder and clones the given repo with the given username
*/
async function connectToRepo(userName, repoURL){
	
	if (fs.existsSync('.git')){
		log('GIT Folder already exists. Please delete .git folder before attempting to clone the repository',true,'yellow');
		return;
	}

	
	//combine in the fomat of https://username@github.com/author/Changeset/repo.git
	let position = 8;
	config.repoURL = [repoURL.slice(0, position), userName+'@', repoURL.slice(position)].join('');
	console.log(config.repoURL);
	saveConfig();
	
	await runCommand(`git init`);
	await runCommand(`git clone ${config.repoURL} .`);
}


/**
* @Description initilizes the SFDX project in the project folder
* @Param projectName a string which is the name of the project.
*/
async function setupSFDXProject(projectName){	
	log(`Setting up Salesforce DX Project ${projectName}`,true);
	if (fs.existsSync(`${projectName}\\.sfdx`)){
		log('SFDX Project folder already exists. Skipping project creation',true,'yellow');
		return;
	}
	await runCommand(`sfdx force:project:create -n ${projectName} --manifest`);
}

/**
* @Description uses SFDX to connect to an org and sets it as default.
*/
async function authorizeSFOrg(loginUrl, orgAlias){
	log(`Authorizing Org ${orgAlias}. Wait for browser window to open and login...`,true);
	await runCommand(`sfdx auth:web:login --instanceurl ${loginUrl} --setdefaultusername`);
}

async function getChangesetsFromFile(){
	let changeSetsToFetchArray = readJSONFromFile(config.changesetJSONFile);
		
	log(`Loaded: ${changeSetsToFetchArray}. Continue downloading/pushing these change sets?`);
	let menuChoice =  await prompt('Y/N: ');
	if(menuChoice.toLowerCase()	== 'y' || menuChoice.toLowerCase() == 'yes') populateAndPushBranches(changeSetsToFetchArray);
	else displayMenu();
}

async function getChangeSetsFromInput(){
	const enteredCSNames =  await prompt('Please enter change set name to fetch. You may enter multiple change sets separated by a comma: ');
	let changeSetsToFetchArray = enteredCSNames.split(',');

	log(`Entered: ${changeSetsToFetchArray}. Continue downloading/pushing these change sets?`);
	let menuChoice =  await prompt('Y/N: ');
	if(menuChoice.toLowerCase()	== 'y' || menuChoice.toLowerCase() == 'yes') populateAndPushBranches(changeSetsToFetchArray);
	else displayMenu();
}

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
		
		log('Fetching package contents',true,'green');
		await runCommand(`sfdx force:source:retrieve -x ${packageFileLocation} -u ${config.salesforceUsername}`);

		log('Staging modified/created files',true,'green');
		await runCommand('git add -A');
		
		//TODO: Attempt to read description from package.xml here if it exists.
		let commitMessage  = await prompt('Please commit description (what is this branch for?): ');
		
		await gitCommit(commitMessage);
		
		await pushBranchToRemote(branchName);
		
		
	}
}

/**
* @Description navigates the current working directory to that of the project root folder.
* @Todo Make this much more robust. It really sucks right now.
*/
function navigateToProjectDir(){
	if(!process.cwd().endsWith(config.projectName)) process.chdir(config.projectName);
}

/**
* @Description validates that a given string is a valid name for a github branch. 
* @Param branchName the string to check for validity
* @Return boolean value. True if the string is valid, false if it is not.
*/
function validateGitBranchName(branchName){
	let branchRegex = '^(main|development|master|(features|tests|(bug|hot)fix)(\/[a-zA-Z0-9]+([-_][a-zA-Z0-9]+)*){1,2}|release\/[0-9]+(\.[0-9]+)*(-(alpha|beta|rc)[0-9]*)?)$';
	const regex = new RegExp(branchRegex);
	let result =  regex.test(branchName);
	if(!result) log('Invalid GIT branch name',true,'red');
	return result;
	
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

			//download the contents of the change set
            await runCommand("sfdx", [`force:mdapi:retrieve`, `-s`, `-u "${config.salesforceUsername}"`, `-r ./${config.downloadedPackagesFolder}`, `-p "${changeSetName}"`, `--unzip`, `--zipfilename "${changeSetName}.zip"`]);
        
			//move the files from the download location into the project folder
			if(copyToProjectFolder) copyPackageIntoProjectFolder(changeSetName);
		}
    }
    return true;
}

function copyPackageIntoProjectFolder(packageName){
	copyFolderRecursiveSync(`${config.downloadedPackagesFolder}\\${packageName}`, config.projectName )
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

async function populateAndPushBranches(branchNames){
	for (const branchName of branchNames) {
		log(`\n\n\n------------------------- PROCESSING BRANCH ${branchName} ------------------------\n\n\n`,true,'green');
		//create our branch
		await createGitBranch(branchName);
		
		//checkout the branch
		await changeToGitBranch(branchName);

		//fetch the contents of the change set for our branch
		await fetchChangeSets([branchName]);
		
		//add the related folder to the branch
		await addFolderToBranch(`${config.downloadedPackagesFolder}\\${branchName}`);
		
		//set our commit message from the package.xml description
		let packageXMLJSON = getPackageXMLAsJson(branchName);
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

function saveConfig(){
	fs.writeFileSync('config.json', JSON.stringify(config, null, 2), function(err){
		if(err) {
			return log(err);
		}
		log("The file was saved!");
	});
}
function getPackageXMLAsJson(folderName){
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

function convertPackgeNameToGitName(branchName){
	branchName = branchName.replace(/\s/g , "-");
	return branchName;
}

async function setGitRemoteURL(repoUrl){
	let command = `git remote set-url ${repoUrl}`;
	log(`Setting GIT Repo URL: ${command}`,true);
	return await runCommand(command); 
}
async function createGitBranch(branchName){
	branchName = convertPackgeNameToGitName(branchName);
	
	if(!checkIfBranchExists(branchName)){
		let command = `git branch ${branchName} -f`;
		log(`Creating branch ${branchName}: ${command}`,true);
		return await runCommand(command); 
	}
	return true;
}
async function changeToGitBranch(branchName){
	branchName = convertPackgeNameToGitName(branchName);
	let command = `git checkout -b ${branchName}`;
	log(`Changing to branch ${branchName}: ${command}`,true);
	return await runCommand(command); 
}

async function pushBranchToRemote(branchName){
	branchName = convertPackgeNameToGitName(branchName);
	//let command = `git push -u origin ${branchName}`
	let command = `git push -u origin HEAD`
	log(`Pushing branch to remote ${branchName}: ${command}`,true);
	return await runCommand(command);
}

async function addFolderToBranch(folderName){
	let command = `git add "${folderName}" --force`;
	log(`Adding folder to branch ${folderName}: ${command}`,true);
	return await runCommand(command);
}

async function gitCommit(commitMessage){
	let command = `git commit -m "${commitMessage}" -a`;
	log(`Commiting branch: ${command}`,true);
	return await runCommand(command);
}

async function checkIfBranchExists(branchName){
	let output = await runCommand(`git branch -l ${branchName})`);
	console.log(`result of branch query ${output}`);
	if(output.length > 0 || output == 0) return true;
	else return false;
}

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
function runCommand(command, arguments) {
    let p = spawn(command, arguments, { shell: true, windowsVerbatimArguments: true });
    return new Promise((resolveFunc) => {
        p.stdout.on("data", (x) => {
            process.stdout.write(x.toString());
            log(x.toString());
        });
        p.stderr.on("data", (x) => {
            process.stderr.write(x.toString());
            log(x.toString());
        });
        p.on("exit", (code) => {
            resolveFunc(code);
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
        if (err) throw err;
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