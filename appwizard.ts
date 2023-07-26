/*
    AppWizard AWS Lambda to Generate Mendix App from parameters and export the MPK

    Parameters - format expected:
        {
            TemplateAppId: "templateAppId",
            TargetBucket: "targetBucket",
            TargetAppName: "targetAppName"
        }
*/

import { MendixPlatformClient } from "mendixplatformsdk";
import { IModel, images } from "mendixmodelsdk";
import * as AWS from "aws-sdk";
import { Handler } from 'aws-lambda';
//import { v4 } from 'uuid';
import * as fs from 'fs';
import * as readline from 'readline';

const s3 = new AWS.S3({ apiVersion: '2006-03-01' });


async function setSCSSVariable(inputFile: string, outputFile: string, variableName: string, newValue: string)
{
    console.log(" start setSCSSVariable");
    const inputStream = fs.createReadStream(inputFile);
    const writeStream = fs.createWriteStream(outputFile);
  
    console.log(" files opened");

    const rl = readline.createInterface({
      input: inputStream,
      crlfDelay: Infinity
    });

    var lineCount = 0;

    // Note: we use the crlfDelay option to recognize all instances of CR LF
    // ('\r\n') in input.txt as a single line break.
  
    for await (const nextLine of rl)
    {
        lineCount++;

        // Each line in input.txt will be successively available here as `line`.
        //console.log(`Line from file: ${line}`);
        if (nextLine.startsWith('$' + variableName + ':'))
        {
            console.log(" replace for " + variableName);

            var newLine = '$' + variableName + ': ' + newValue + ';';
            writeStream.write(newLine + '\n', function(){});
        }
        else
        {
            writeStream.write(nextLine + '\n', function(){});
        }
    }

    console.log(" close file: " + lineCount + " lines processed");
    writeStream.close();
}
  
export const handler: Handler = async(event, context) => 
{
    // Extract the request details
    const request = event;
    const templateAppId = request.TemplateAppId;
    const mpkObjectName = request.MpkObjectName;
    const bucket = request.Bucket;
    const requestId = request.RequestId;
    const version = request.version;
    const tempLocalMpkFile = "/tmp/TempMpkFile";
    const tempLocalInputFile = "/tmp/TempInputFile";
    const tempLocalOutputFile = "/tmp/TempOutputFile";
    var model: IModel;
 //   const s3MpkName = "AppWizard-" + mpkObjectName + "-" + v4() + '.mpk';
    
    try
    {
        const client = new MendixPlatformClient();

        console.log("Get app");
        const app = await client.getApp(templateAppId);
        
        console.log("create temp working copy");
        const workingCopy = await app.createTemporaryWorkingCopy("main");
        
        console.log("open model");
        model = await workingCopy.openModel();

        const project = model.allProjects()[0];
    }
    catch (err)
    {
        console.error(err);

        const message = `Error opening app ${templateAppId}`;
        console.error(message);

        return { statusCode: 500, body: message };
    }

    // Test Only
    //console.log("create module");
    //const module = projects.Module.createIn(project);
    //security.ModuleSecurity.createIn(module);
    //module.name = "TestModule";
    // End Test Only

    for (var change of request.Changes)
    {
        var changeType = change.ChangeType;
        var location = change.Location;
        var itemName = change.ItemName;
        var newValue = change.NewValue;
        var objectName = change.ObjectName;
        
        var format: images.MxImageFormat;
        if (change.Format === 'BMP') format = images.MxImageFormat.Bmp;
        else if (change.Format === 'GIF') format = images.MxImageFormat.Gif;
        else if (change.Format === 'JPG') format = images.MxImageFormat.Jpg;
        else if (change.Format === 'PNG') format = images.MxImageFormat.Png;
        else if (change.Format === 'SVG') format = images.MxImageFormat.Svg;
        else format = images.MxImageFormat.Unknown;


        console.log("Process request: " + changeType + " - " + location + " - " + itemName + " - " + newValue + " - " + objectName + " - " + change.format);

        if (changeType == 'CSS_Variable_Change')
        {
            try
            {
                console.log("getFile");
                await model.getFile(location, tempLocalInputFile);
            }
            catch (err)
            {
                console.error(err);
        
                const message = `Error getting file from model ${templateAppId} to local disk ${tempLocalInputFile}`;
                console.error(message);
        
                return { statusCode: 500, body: message };
            }
        
            try
            {
                console.log("setSCSSVariable");
                await setSCSSVariable(tempLocalInputFile, tempLocalOutputFile, itemName, newValue);
            }
            catch (err)
            {
                console.error(err);
        
                const message = `Error setting variable ${itemName} to ${newValue}`;
                console.error(message);
        
                return { statusCode: 500, body: message };
            }

            try
            {
                console.log("deleteFile");
                await model.deleteFile(location);
            }
            catch (err)
            {
                console.error(err);
        
                const message = `Error deleting file ${location}`;
                console.error(message);
        
                return { statusCode: 500, body: message };
            }

            try
            {
                console.log("putFile");
                await model.putFile(tempLocalOutputFile, location);
            }
            catch (err)
            {
                console.error(err);
        
                const message = `Error putting file ${tempLocalOutputFile} to ${location}`;
                console.error(message);
        
                return { statusCode: 500, body: message };
            }
        
            console.log("change complete");
        }
        else if (changeType == 'ImageCollection_Image_Change')
        {
            var iimageCollection: images.IImageCollection | undefined;

            try
            {
                console.log("find image collection");
                iimageCollection = await model.allImageCollections().find(c => c.qualifiedName === location);
            }
            catch (err)
            {
                console.error(err);
        
                const message = `Error finding image collection ${location}`;
                console.error(message);
        
                return { statusCode: 500, body: message };
            }

            if (iimageCollection == undefined)
            {
                const message = `Cannot find image collection ${location}`;
                console.error(message);
        
                return { statusCode: 500, body: message };
            }

            var imageCollection: images.ImageCollection;
            try
            {
                console.log(`load image collection ${location}`);
                imageCollection = await iimageCollection.load();
            }
            catch (err)
            {
                console.error(err);
        
                const message = `Error loading image collection ${location}`;
                console.error(message);
        
                return { statusCode: 500, body: message };
            }

            var existingImage: images.Image | undefined;
            try
            {
                console.log(`find image ${itemName}`);
                existingImage = imageCollection.images.find(i => i.name === itemName);
            }
            catch (err)
            {
                console.error(err);
        
                const message = `Error finding image ${itemName}`;
                console.error(message);
        
                return { statusCode: 500, body: message };
            }

            if (existingImage != undefined)
            {
                try
                {
                    console.log(`load/delete existing image ${itemName}`);
                    const image = await existingImage.load();
                    image.delete();
                }
                catch (err)
                {
                    console.error(err);
        
                    const message = `Error loading/deleting image ${itemName}`;
                    console.error(message);
            
                    return { statusCode: 500, body: message };
                }
            }

            var imageData: AWS.S3.GetObjectOutput;
            try
            {
                console.log(`get s3 image object ${objectName} from ${bucket}`);

                const parameters = {
                    Bucket: bucket,
                    Key: objectName
                };

                imageData = await s3.getObject(parameters).promise();
            }
            catch (err)
            {
                console.error(err);
        
                const message = `Error getting s3 image object ${objectName} from ${bucket}`;
                console.error(message);
        
                return { statusCode: 500, body: message };
            }

            if ((imageData == undefined) || (imageData.Body == undefined))
            {
                const message = `Cannot load s3 image object ${objectName} from ${bucket}`;
                console.error(message);
        
                return { statusCode: 500, body: message };
            }

            try
            {
                console.log("set image data");
                const imageString = imageData.Body.toString('base64');
    
                const newImage = await images.Image.createIn(imageCollection)
                newImage.name = itemName;
                newImage.imageData = imageString;
                newImage.imageFormat = format;
            }
            catch (err)
            {
                console.error(err);
        
                const message = `Error creating image ${itemName}`;
                console.error(message);
        
                return { statusCode: 500, body: message };
            }
        }
    }


    try
    {
        console.log("flushing changes");
        await model.flushChanges();
    }
    catch (err)
    {
        console.error(err);
        
        const message = `Error flushing changes`;
        console.error(message);

        return { statusCode: 500, body: message };
    }

    try
    {
        console.log("export mpk");
        await model.exportMpk(tempLocalMpkFile);
    
    }
    catch (err)
    {
        console.error(err);
        
        const message = `Error exporting mpk`;
        console.error(message);

        return { statusCode: 500, body: message };
    }

    try
    {
        console.log("delete working copy");
        await model.deleteWorkingCopy();
    }
    catch (err)
    {
        console.error(err);
        
        const message = `Error deleting working copy`;
        console.error(message);

        return { statusCode: 500, body: message };
    }
    
    try
    {
        console.log("read mpk");
        const mpkData = fs.readFileSync(tempLocalMpkFile);
        
        console.log("write to s3");
        var params:AWS.S3.PutObjectRequest = {
            Bucket: bucket!,
            Key: mpkObjectName,
            Body: mpkData
        };
    
        await s3.putObject(params).promise();
    }
    catch (err)
    {
        console.error(err);
        
        const message = `Error reading mpk/writing to s3`;
        console.error(message);

        return { statusCode: 500, body: message };
    }

    console.log("all done: " + mpkObjectName);

    return { statusCode: 200, body: mpkObjectName };
}
