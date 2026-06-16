(function applyInitialTheme() {
    try {
        var saved = localStorage.getItem('theme');
        var theme = saved;

        if (theme !== 'light' && theme !== 'dark') {
            theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';
        }

        document.documentElement.classList.add(theme);
        document.documentElement.style.colorScheme = theme;
    } catch {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
    }
})();
