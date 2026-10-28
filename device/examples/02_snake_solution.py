"""Standalone automatic Snake solution; run in RAM, not as main.py."""


# Only edit this input handler; the game engine below is ready-made.
def handle_input(game, name):
    """Return (state_changed, exit_requested) for one debounced press."""
    if name == "Back":
        return False, True
    if name == "Up":
        return game.rotate(-1), False
    if name == "Down":
        return game.rotate(1), False
    if name == "Press":
        if game.over:
            game.restart()
        return game.start(), False
    if name == "Menu":
        return game.restart(), False
    return False, False


RUN_MS = 300_000
STEP_MS = 5000
DEBOUNCE_MS = 30
POLL_MS = 5
CONTROLS = (("Back", "back"), ("Menu", "menu"), ("Up", "up"),
            ("Down", "down"), ("Press", "dial"))
DIRECTIONS = ((1, 0), (0, 1), (-1, 0), (0, -1))
HEADINGS = ("3:00 >", "6:00 v", "9:00 <", "12:00 ^")


class Game:
    """Hardware-free rules. The head is snake[0]; heading starts right."""

    def __init__(self, columns=8, rows=8):
        if columns < 4 or rows < 2:
            raise ValueError("Snake needs at least four columns and two rows")
        self.columns = columns
        self.rows = rows
        self.restart()

    def restart(self):
        head_x = self.columns // 2
        head_y = self.rows // 2
        self.snake = [(head_x - offset, head_y) for offset in range(3)]
        self.direction = 0
        self.score = 0
        self.over = False
        self.running = False
        self.won = False
        self.food = self.place_food()
        return True

    def start(self):
        if self.over or self.running:
            return False
        self.running = True
        return True

    def place_food(self):
        """Prefer free cells near the center, with the first food one step ahead."""
        center_x, center_y = self.columns // 2, self.rows // 2
        head_x, head_y = self.snake[0]
        delta_x, delta_y = DIRECTIONS[self.direction]
        ahead = (head_x + delta_x, head_y + delta_y)
        if (0 <= ahead[0] < self.columns and 0 <= ahead[1] < self.rows
                and ahead not in self.snake
                and abs(ahead[0] - center_x) + abs(ahead[1] - center_y) <= 1):
            return ahead
        nearest = None
        nearest_distance = self.columns + self.rows
        for row in range(self.rows):
            for column in range(self.columns):
                distance = abs(column - center_x) + abs(row - center_y)
                if distance < nearest_distance and (column, row) not in self.snake:
                    nearest = (column, row)
                    nearest_distance = distance
        return nearest

    def rotate(self, turn):
        """Use -1 for counterclockwise (Up), +1 for clockwise (Down)."""
        if self.over:
            return False
        self.direction = (self.direction + turn) % 4
        return True

    def advance(self):
        """Timer advances one cell while running; the vacating tail is legal."""
        if not self.running:
            return False
        delta_x, delta_y = DIRECTIONS[self.direction]
        head_x, head_y = self.snake[0]
        next_head = (head_x + delta_x, head_y + delta_y)
        growing = next_head == self.food
        body = self.snake if growing else self.snake[:-1]
        if (not 0 <= next_head[0] < self.columns
                or not 0 <= next_head[1] < self.rows or next_head in body):
            self.over = True
            self.running = False
            return True
        self.snake.insert(0, next_head)
        if growing:
            self.score += 1
            self.food = self.place_food()
            self.won = self.food is None
            self.over = self.won
            self.running = not self.won
        else:
            self.snake.pop()
        return True


class Controls:
    """Active-low edges; held-at-baseline controls must release first."""

    def __init__(self, panel, now):
        self.states = []
        for name, attribute in CONTROLS:
            pin = getattr(panel, attribute, None)
            if pin is not None:
                initial = pin.value()
                self.states.append({
                    "name": name, "pin": pin, "stable": initial,
                    "candidate": initial, "changed_at": now,
                })

    def presses(self, now, ticks_diff):
        pressed = []
        for state in self.states:
            reading = state["pin"].value()
            if reading != state["candidate"]:
                state["candidate"] = reading
                state["changed_at"] = now
            elif reading != state["stable"] and ticks_diff(
                now, state["changed_at"]
            ) >= DEBOUNCE_MS:
                state["stable"] = reading
                if reading == 0:
                    pressed.append(state["name"])
        return pressed


def draw(panel, game, on_wait=None):
    panel.fill()
    panel.rect(4, 20, game.columns * 10 + 2, game.rows * 10 + 2)
    for column, row in game.snake:
        panel.rect(6 + column * 10, 22 + row * 10, 8, 8, fill=True)
    head_x, head_y = game.snake[0]
    panel.rect(8 + head_x * 10, 24 + head_y * 10, 3, 3, color=1, fill=True)
    if game.food is not None:
        food_x, food_y = game.food
        panel.rect(8 + food_x * 10, 24 + food_y * 10, 3, 3)
    status = "You won!" if game.won else "Game over" if game.over else "Auto move" if game.running else "Press: start"
    panel.text("SNAKE", 124, 6)
    panel.text("Score: %d" % game.score, 124, 23)
    panel.text(status, 124, 39)
    panel.text("Press: replay" if game.over else HEADINGS[game.direction], 124, 53)
    panel.text("Up: CCW", 124, 70)
    panel.text("Down: CW", 124, 82)
    panel.text("Menu: reset", 124, 98)
    panel.text("Back: exit", 124, 110)
    if getattr(panel, "SUPPORTS_WAIT_CALLBACK", False):
        panel.show(on_wait=on_wait)
    else:
        panel.show()


def run(duration_ms=RUN_MS, step_ms=STEP_MS):
    """One automatic move per timed frame; keep collecting inputs during waits."""
    from time import sleep_ms, ticks_diff, ticks_ms
    from crowpanel import CrowPanel

    game = Game()
    if not isinstance(step_ms, int) or step_ms <= 0:
        raise ValueError("step_ms must be a positive integer")
    if duration_ms <= 0:
        return game
    started_at = ticks_ms()
    panel = None
    print("Snake: Press starts automatic movement. Up: counterclockwise; Down: clockwise.")
    print("Menu resets to ready; Back exits; Ctrl-C/browser Stop interrupts.")
    print("Viewing time: %d ms after each full refresh; refresh time is additional." % step_ms)
    print("Runs for up to %g seconds, plus any in-progress driver refresh." % (
        duration_ms / 1000,
    ))
    try:
        panel = CrowPanel(controller="jd79661")
        if getattr(panel, "SUPPORTS_WAIT_CALLBACK", False):
            print("Steering is collected during full refreshes; no extra refresh for a turn.")
        else:
            print("Older workshop driver: Inputs during refresh are unavailable; hold controls until refresh ends.")
            print("Update workshop libraries: Board check > Advanced install. No firmware reflash needed.")
        controls = Controls(panel, ticks_ms())
        pending = []

        def poll_inputs():
            for name in controls.presses(ticks_ms(), ticks_diff):
                if name == "Back":
                    pending[:] = ["Back"]
                    return
                if "Back" in pending:
                    continue
                if name == "Menu":
                    pending[:] = ["Menu"]
                elif len(pending) < 16:
                    pending.append(name)
                elif name == "Press":
                    for index, queued in enumerate(pending):
                        if queued in ("Up", "Down"):
                            del pending[index]
                            pending.append(name)
                            break

        print("Drawing ready screen. Wait for the full refresh to finish.")
        draw(panel, game, on_wait=poll_inputs)
        print("Ready. Press starts; Menu resets; Back exits.")
        last_move = ticks_ms()
        turn_applied = False
        while ticks_diff(ticks_ms(), started_at) < duration_ms:
            poll_inputs()
            redraw = False
            deferred = []
            for name in pending:
                if name in ("Up", "Down") and turn_applied:
                    deferred.append(name)
                    continue
                was_running = game.running
                changed, exiting = handle_input(game, name)
                if exiting:
                    print("Snake exited with Back. Click Run in RAM to play again.")
                    return game
                if game.running and not was_running:
                    last_move = ticks_ms()
                if name in ("Up", "Down") and changed:
                    turn_applied = True
                if name == "Menu":
                    redraw = changed
                    turn_applied = False
                    deferred.clear()
            pending[:] = deferred
            now = ticks_ms()
            if game.running and ticks_diff(now, last_move) >= step_ms:
                redraw = game.advance() or redraw
                last_move = now
                turn_applied = False
            if redraw and ticks_diff(ticks_ms(), started_at) < duration_ms:
                draw(panel, game, on_wait=poll_inputs)
                last_move = ticks_ms()
                if game.over:
                    print("You won! Press plays again; Menu resets." if game.won else
                          "Game over. Press plays again; Menu resets.")
            remaining_ms = duration_ms - ticks_diff(ticks_ms(), started_at)
            if remaining_ms > 0:
                sleep_ms(min(POLL_MS, remaining_ms))
        print("Session ended. Click Run in RAM to play again; board buttons are now inactive.")
    except Exception as error:
        print("Snake stopped on an error: %s. Copy the serial console before rerunning." % error)
        raise
    finally:
        if panel is not None:
            panel.power.value(0)
    return game


if __name__ == "__main__":
    run()
