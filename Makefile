all: prjtxt zip

zip:
	rm -f ./trabalho.zip; cd ..; zip -r trabalho.zip trabalho

prjtxt:
	mv project.txt project.txt-tab
	expand -4 project.txt-tab > project.txt
	@rm -f project.txt-tab
