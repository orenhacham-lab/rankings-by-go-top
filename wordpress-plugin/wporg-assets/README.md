# wordpress.org assets

Everything here belongs in the **`assets/` directory of the plugin's SVN
repository**, not in the plugin zip. The directory serves these files from
`https://wordpress.org/plugins/go-top-seo-bridge/`; nothing here is shipped to a
site that installs the plugin, and nothing here is hashed by
`lib/site-fix/__qa__/approved-plugin.ts`, which pins only the files inside the
zip.

| File | What it is |
|---|---|
| `banner-1544x500.png`, `banner-772x250.png` | the header on the directory page |
| `icon-128x128.png`, `icon-256x256.png` | the plugin's icon, in the directory's listings and in the site's own plugin screen |
| `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png` | numbered to the `== Screenshots ==` list in `readme.txt` |
| `blueprints/blueprint.json` | the Live Preview (below) |

The icons live here because the workflow that publishes this directory
(`.github/workflows/wporg-deploy.yml`) keeps what is in SVN and adds what is
here. They were committed to SVN by hand before that workflow existed, which
is how a run that mirrored this directory with `--delete` removed them; they
were restored from revision 3761427 and the mirroring no longer deletes.

## Live Preview

`blueprints/blueprint.json` turns on the **Live Preview** button on our
directory page. It boots a whole WordPress in the visitor's own browser
(WordPress Playground), with our plugin already active, and lands them on
Settings → GO TOP SEO. No download, no hosting, no account.

That matters more for us than for most plugins. A plugin with no reviews asks a
stranger to install unknown code on a live site before they can see anything;
the preview removes that ask entirely. It is off by default, which is why most
plugins do not have it.

It takes **two** steps, and the second is the one people miss — with the file
committed but the switch off, the button simply does not appear, and the
blueprint looks broken when it is not:

1. Commit this directory to SVN:

   ```
   svn co https://plugins.svn.wordpress.org/go-top-seo-bridge/ gotop-svn
   mkdir -p gotop-svn/assets/blueprints
   cp wordpress-plugin/wporg-assets/blueprints/blueprint.json gotop-svn/assets/blueprints/
   cd gotop-svn
   svn add --force assets
   svn ci -m "assets: live preview blueprint" --username <wporg-user>
   ```

2. On the plugin's page in the directory, open **Advanced** and set the plugin
   preview to **public**. A committer has to do this; it cannot be done from a
   file.

### Keeping it working

`landingPage` is `options-general.php?page=go-top-seo-bridge`, which is the slug
`add_options_page` registers in `includes/admin.php`. If that slug ever changes,
this file changes with it or the preview lands on a WordPress error page.

`features.networking` is on because the settings screen pairs with our API. In
the preview nobody has a pairing code, so what a visitor sees is the unpaired
state — which is the correct first screen to show them anyway.

The file is validated against
`https://playground.wordpress.net/blueprint-schema.json`. Two fields that read
as obvious are wrong and were removed while writing it: `phpExtensionBundles`
is deprecated, and there is no `login` **step** — logging in is the top-level
`login` field.
