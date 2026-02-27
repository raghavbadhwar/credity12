import time
from playwright.sync_api import sync_playwright

def verify_theme_toggle_tooltip():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Emulate a desktop viewport to ensure sidebar is visible
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        try:
            # Navigate to the app (assuming it runs on port 5000 based on package.json dev:client)
            page.goto("http://localhost:5000")

            # Wait for the sidebar to be visible
            # The theme toggle button has aria-label="Toggle theme"
            theme_button = page.locator('button[aria-label="Toggle theme"]')
            theme_button.wait_for(state="visible", timeout=10000)

            # Hover over the button to trigger the tooltip
            theme_button.hover()

            # Wait a moment for the tooltip animation
            time.sleep(1)

            # Take a screenshot of the sidebar area including the tooltip
            # We'll capture the top-left area where the header and toggle are
            page.screenshot(path="verification_tooltip.png", clip={'x': 0, 'y': 0, 'width': 300, 'height': 200})

            print("Screenshot taken: verification_tooltip.png")

            # Verify the tooltip content exists in the DOM
            tooltip_content = page.get_by_text("Toggle theme")
            if tooltip_content.is_visible():
                print("Tooltip content 'Toggle theme' is visible.")
            else:
                print("Tooltip content 'Toggle theme' NOT found/visible.")

        except Exception as e:
            print(f"Error during verification: {e}")
            # Take a full page screenshot for debugging if something fails
            page.screenshot(path="debug_failure.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_theme_toggle_tooltip()
