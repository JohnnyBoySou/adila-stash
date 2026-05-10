package main

import (
	"embed"
	_ "embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var embeddedAppIcon []byte

func main() {
	cfg := NewConfig()
	gh := NewGitHub(cfg)
	gs := NewGitService()

	app := application.New(application.Options{
		Name:        "Stash",
		Description: "A minimal Git desktop client",
		Icon:        embeddedAppIcon,
		Linux: application.LinuxOptions{
			ProgramName: "stash",
		},
		// Ordem importa: Config sobe primeiro para que GitHub já encontre
		// o token persistido no startup. Shutdown roda na ordem reversa.
		Services: []application.Service{
			application.NewService(cfg),
			application.NewService(gh),
			application.NewService(gs),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:          "Stash",
		Frameless:      true,
		BackgroundType: application.BackgroundTypeTranslucent,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		Linux: application.LinuxWindow{
			Icon:                embeddedAppIcon,
			WindowIsTranslucent: true,
		},
		Width:            1280,
		Height:           800,
		MinWidth:         960,
		MinHeight:        600,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		URL:              "/",
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
