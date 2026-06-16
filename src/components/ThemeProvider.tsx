import { createContext, useContext, useState, useLayoutEffect } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('theme');
                if (saved === 'dark' || saved === 'light') {
                    return saved;
                }
            } catch {
                // localStorage indisponível.
            }

            if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
        }

        return 'dark';
    });

    // useLayoutEffect evita FOUC ao aplicar a classe antes da pintura.
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        root.style.colorScheme = theme;

        try {
            localStorage.setItem('theme', theme);
        } catch {
            // localStorage indisponível.
        }
    }, [theme]);

    const toggleTheme = () => {
        setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
    };

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
