import { useFavoritesStore } from '@/store/favoritesStore'

beforeEach(() => {
  useFavoritesStore.setState({ articles: [] })
})

describe('favoritesStore', () => {
  it('starts empty', () => {
    expect(useFavoritesStore.getState().articles).toEqual([])
  })

  it('adds article to favorites', () => {
    useFavoritesStore.getState().toggleFavorite('BR001')
    expect(useFavoritesStore.getState().articles).toEqual(['BR001'])
  })

  it('removes article from favorites on second toggle', () => {
    useFavoritesStore.getState().toggleFavorite('BR001')
    useFavoritesStore.getState().toggleFavorite('BR001')
    expect(useFavoritesStore.getState().articles).toEqual([])
  })

  it('checks if article is favorite', () => {
    useFavoritesStore.getState().toggleFavorite('BR001')
    expect(useFavoritesStore.getState().isFavorite('BR001')).toBe(true)
    expect(useFavoritesStore.getState().isFavorite('ALT001')).toBe(false)
  })

  it('supports multiple favorites', () => {
    useFavoritesStore.getState().toggleFavorite('BR001')
    useFavoritesStore.getState().toggleFavorite('ALT001')
    expect(useFavoritesStore.getState().articles).toHaveLength(2)
  })
})
