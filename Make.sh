tsc appwizard.ts
rm -f TempMpkFile
rm -f ../../AppWizardLambda.zip
zip -r ../../AppWizardLambda.zip .
cp ../../AppWizardLambda.zip /media/psf/Home/Temp
